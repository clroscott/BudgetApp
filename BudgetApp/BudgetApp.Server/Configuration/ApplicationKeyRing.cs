using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using System.Text.Json;
using System.Xml;
using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;

namespace BudgetApp.Server.Configuration;

public sealed record ApplicationKeyRing(string EnvironmentName, string ApplicationName, string? DirectoryPath)
{
    public const string ManifestName = "budgetapp-key-ring.json";
    private const string ProbePurpose = "BudgetApp.KeyRing.Readiness.v1";
    private const string ProbeValue = "BudgetApp key-ring recovery check v1";
    public bool IsProduction => EnvironmentName == "Production";

    public static ApplicationKeyRing Register(IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var name = environment.EnvironmentName;
        if (name is not ("Development" or "Production" or "Scratch" or "Testing"))
            throw new InvalidOperationException("Unsupported key-ring environment. Use Development, Scratch, Testing, or the documented Windows Production configuration.");
        var appName = $"BudgetApp.{name}.v1";
        if (name == "Testing")
        {
            services.AddDataProtection().SetApplicationName(appName).UseEphemeralDataProtectionProvider();
            return new(name, appName, null);
        }

        // Never let inherited Production settings redirect Visual Studio to its keys.
        if (name != "Production")
        {
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (string.IsNullOrWhiteSpace(local))
                throw new InvalidOperationException("A local user profile is required for Development/Scratch key storage.");
            var path = Path.Combine(local, "BudgetApp", "DataProtection", name);
            var development = services.AddDataProtection().SetApplicationName(appName)
                .PersistKeysToFileSystem(new DirectoryInfo(path));
            if (OperatingSystem.IsWindows()) development.ProtectKeysWithDpapi();
            return new(name, appName, path);
        }

        if (!OperatingSystem.IsWindows())
            throw new InvalidOperationException("Production key storage currently supports Windows only. Configure and verify the selected hosting provider before deploying to another platform.");
        var productionPath = ValidateLocation(configuration["DataProtection:KeyRingPath"], environment.ContentRootPath);
        var thumbprint = NormalizeThumbprint(configuration["DataProtection:CertificateThumbprint"]);
        var certificate = LoadCertificate(thumbprint, requireCurrent: true);
        var retained = configuration.GetSection("DataProtection:DecryptionCertificateThumbprints").Get<string[]>() ?? [];
        var certificates = retained.Select(value => LoadCertificate(NormalizeThumbprint(value), requireCurrent: false))
            .Append(certificate).ToArray();
        ConfigureCertificateRing(services, productionPath, appName, certificate, certificates);
        return new(name, appName, productionPath);
    }

    // Also used by portable, isolated recovery tests; production resolves certificates
    // exclusively from the launching Windows user's certificate store above.
    public static void ConfigureCertificateRing(IServiceCollection services, string path, string appName,
        X509Certificate2 certificate, params X509Certificate2[] decryptionCertificates)
    {
        services.AddSingleton(new WrappingCertificates(decryptionCertificates.Append(certificate)
            .Select(item => item.Thumbprint).ToHashSet(StringComparer.OrdinalIgnoreCase)));
        services.AddDataProtection().SetApplicationName(appName)
            .PersistKeysToFileSystem(new DirectoryInfo(path))
            .ProtectKeysWithCertificate(certificate)
            .UnprotectKeysWithAnyCertificate(decryptionCertificates.Append(certificate).ToArray())
            .SetDefaultKeyLifetime(TimeSpan.FromDays(90));
    }

    public static string ValidateLocation(string? value, string contentRoot)
    {
        if (string.IsNullOrWhiteSpace(value) || !Path.IsPathFullyQualified(value))
            throw new InvalidOperationException("DataProtection:KeyRingPath must be an absolute directory outside the application and repository. Follow docs/production-key-storage.md before deploying.");
        var path = Path.GetFullPath(value).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (string.IsNullOrEmpty(path) || path == Path.GetPathRoot(path)?.TrimEnd(Path.DirectorySeparatorChar) ||
            IsWithin(path, contentRoot) || (OperatingSystem.IsWindows() && path.StartsWith(@"\\", StringComparison.Ordinal)))
            throw new InvalidOperationException("The Production key ring must use a dedicated local directory outside the application, not a root, network share, or publish directory.");
        for (var current = new DirectoryInfo(path); current != null; current = current.Parent)
        {
            if (Directory.Exists(Path.Combine(current.FullName, ".git")) || File.Exists(Path.Combine(current.FullName, ".git")))
                throw new InvalidOperationException("Production keys must not be stored in a Git checkout.");
            if (current.Exists && current.Attributes.HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidOperationException("Key-ring directories must not use symbolic links or junctions.");
        }
        return path;
    }

    private static bool IsWithin(string path, string parent)
    {
        var root = Path.GetFullPath(parent).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        return path.Equals(root, comparison) || path.StartsWith(root + Path.DirectorySeparatorChar, comparison);
    }

    public static string NormalizeThumbprint(string? value)
    {
        var result = value?.Replace(" ", "", StringComparison.Ordinal).ToUpperInvariant();
        if (result?.Length != 40 || result.Any(c => !Uri.IsHexDigit(c)))
            throw new InvalidOperationException("Configure a valid DataProtection:CertificateThumbprint from the app-running user's CurrentUser/My store. This is not the HTTPS certificate.");
        return result;
    }

    private static X509Certificate2 LoadCertificate(string thumbprint, bool requireCurrent)
    {
        try
        {
            using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
            store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);
            var matches = store.Certificates.Find(X509FindType.FindByThumbprint, thumbprint, validOnly: false);
            if (matches.Count != 1 || !matches[0].HasPrivateKey) throw new CryptographicException();
            var certificate = matches[0];
            if (requireCurrent && (certificate.NotBefore.ToUniversalTime() > DateTime.UtcNow || certificate.NotAfter.ToUniversalTime() <= DateTime.UtcNow))
                throw new CryptographicException();
            using var rsa = certificate.GetRSAPrivateKey();
            if (rsa is null || rsa.KeySize < 2048) throw new CryptographicException();
            // Prove private-key access, not merely the presence of a certificate.
            var bytes = RandomNumberGenerator.GetBytes(32);
            var signature = rsa.SignData(bytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            if (!rsa.VerifyData(bytes, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)) throw new CryptographicException();
            if (OperatingSystem.IsWindows())
            {
                if (rsa is not RSACng cng || cng.Key.IsMachineKey) throw new CryptographicException();
                if (string.IsNullOrEmpty(cng.Key.UniqueName)) throw new CryptographicException();
                var privateKeyPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "Microsoft", "Crypto", "Keys", cng.Key.UniqueName);
                ValidateWindowsAcl(new FileInfo(privateKeyPath));
            }
            return certificate;
        }
        catch (Exception error) when (error is CryptographicException or IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            throw new InvalidOperationException("A configured Data Protection certificate/private key is missing, expired, unsupported, or inaccessible. Restore the dedicated CurrentUser/My certificate and its restricted private-key permissions; never generate replacement keys to bypass this error.");
        }
    }

    public void Initialize(IServiceProvider services)
    {
        if (!IsProduction) throw new InvalidOperationException("Explicit initialization is only for the Windows Production key ring.");
        ValidateDirectory();
        if (Directory.EnumerateFileSystemEntries(DirectoryPath!).Any())
            throw new InvalidOperationException("Initialization requires an empty, prepared directory. Existing files are never replaced. Use check or restore instead.");
        var key = services.GetRequiredService<IKeyManager>().CreateNewKey(DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(90));
        var probe = Protector(services).Protect(ProbeValue);
        var manifest = JsonSerializer.Serialize(new KeyRingManifest(1, ApplicationName, key.KeyId, probe));
        using (var stream = new FileStream(Path.Combine(DirectoryPath!, ManifestName), FileMode.CreateNew, FileAccess.Write, FileShare.None))
        using (var writer = new StreamWriter(stream)) writer.Write(manifest);
        Verify(services);
    }

    public void Verify(IServiceProvider services)
    {
        if (!IsProduction) return;
        try
        {
            ValidateDirectory();
            var files = Directory.GetFiles(DirectoryPath!, "*.xml");
            var keyCount = 0;
            var permittedCertificates = services.GetRequiredService<WrappingCertificates>().Thumbprints;
            foreach (var file in files)
            {
                if (File.GetAttributes(file).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException();
                if (OperatingSystem.IsWindows()) ValidateWindowsAcl(new FileInfo(file));
                using var reader = XmlReader.Create(file, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, MaxCharactersInDocument = 1024 * 1024 });
                var xml = XDocument.Load(reader);
                if (xml.Root?.Name.LocalName != "key") continue; // framework revocation records are also retained.
                keyCount++;
                if (xml.Descendants().Any(element => element.Name.LocalName == "masterKey") ||
                    !xml.Descendants().Any(element => element.Name.LocalName == "encryptedSecret" &&
                        (element.Attribute("decryptorType")?.Value.StartsWith("Microsoft.AspNetCore.DataProtection.XmlEncryption.EncryptedXmlDecryptor,", StringComparison.Ordinal) ?? false)))
                    throw new InvalidOperationException();
                var embedded = xml.Descendants().Where(element => element.Name.LocalName == "X509Certificate").ToArray();
                if (embedded.Length == 0) throw new InvalidOperationException();
                foreach (var item in embedded)
                {
                    using var publicCertificate = X509CertificateLoader.LoadCertificate(Convert.FromBase64String(item.Value));
                    // Do not rely on the framework's automatic store lookup for old
                    // certificates: backups must know every required private key.
                    if (!permittedCertificates.Contains(publicCertificate.Thumbprint)) throw new InvalidOperationException();
                }
            }
            var manifestPath = Path.Combine(DirectoryPath!, ManifestName);
            if (File.GetAttributes(manifestPath).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException();
            if (OperatingSystem.IsWindows()) ValidateWindowsAcl(new FileInfo(manifestPath));
            var manifest = JsonSerializer.Deserialize<KeyRingManifest>(File.ReadAllText(manifestPath));
            var keys = services.GetRequiredService<IKeyManager>().GetAllKeys();
            if (manifest is null || manifest.Version != 1 || manifest.ApplicationName != ApplicationName || keyCount == 0 ||
                keys.Count != keyCount || !keys.Any(key => key.KeyId == manifest.AnchorKeyId)) throw new InvalidOperationException();
            // Force decryption of every retained key. The framework otherwise may
            // skip unreadable older keys and automatically generate a fresh ring.
            foreach (var key in keys) if (key.CreateEncryptor() is null) throw new InvalidOperationException();
            if (Protector(services).Unprotect(manifest.ProtectedProbe) != ProbeValue) throw new InvalidOperationException();
        }
        catch (Exception error) when (error is CryptographicException or IOException or UnauthorizedAccessException or InvalidOperationException or XmlException or JsonException or FormatException)
        {
            // Do not emit XML, ciphertext, private keys, or raw provider exceptions.
            throw new InvalidOperationException("Production Data Protection key-ring validation failed. Stop deployment and restore/check the existing ring, manifest, retained certificates, and permissions using docs/production-key-storage.md. No fresh ring was substituted.");
        }
    }

    public void WriteProbe(IServiceProvider services, string file)
    {
        Verify(services);
        // A distinct purpose from authentication; this probe grants no app access.
        var protectedValue = Protector(services).Protect(ProbeValue);
        using var stream = new FileStream(file, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        using var writer = new StreamWriter(stream);
        writer.Write(protectedValue);
    }

    public void VerifyProbe(IServiceProvider services, string file)
    {
        Verify(services);
        if (Protector(services).Unprotect(File.ReadAllText(file)) != ProbeValue)
            throw new InvalidOperationException("Recovery probe did not match.");
    }

    private static IDataProtector Protector(IServiceProvider services) => services.GetRequiredService<IDataProtectionProvider>().CreateProtector(ProbePurpose);

    private void ValidateDirectory()
    {
        if (DirectoryPath is null || !Directory.Exists(DirectoryPath) || File.GetAttributes(DirectoryPath).HasFlag(FileAttributes.ReparsePoint))
            throw new InvalidOperationException("The prepared Production key directory is missing. Restore it or follow the explicit first-install procedure; the app will not create it.");
        if (OperatingSystem.IsWindows()) ValidateWindowsAcl(new DirectoryInfo(DirectoryPath));
        // Validate create/write access before automatic rotation is ever needed.
        using var probe = new FileStream(Path.Combine(DirectoryPath, ".access-check-" + Guid.NewGuid().ToString("N")),
            FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None, 1, FileOptions.DeleteOnClose);
        probe.WriteByte(0);
    }

    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
    private static void ValidateWindowsAcl(FileSystemInfo item)
    {
        var security = item is DirectoryInfo directory ? (FileSystemSecurity)directory.GetAccessControl() : ((FileInfo)item).GetAccessControl();
        using var identity = WindowsIdentity.GetCurrent();
        var trusted = new HashSet<string> { identity.User!.Value, "S-1-5-18", "S-1-5-32-544" };
        if (item is DirectoryInfo && !security.AreAccessRulesProtected) throw new InvalidOperationException();
        foreach (FileSystemAccessRule rule in security.GetAccessRules(true, true, typeof(SecurityIdentifier)))
            if (rule.AccessControlType == AccessControlType.Allow && !trusted.Contains(rule.IdentityReference.Value) && rule.FileSystemRights != 0)
                throw new InvalidOperationException();
    }

    private sealed record KeyRingManifest(int Version, string ApplicationName, Guid AnchorKeyId, string ProtectedProbe);
    private sealed record WrappingCertificates(HashSet<string> Thumbprints);
}
