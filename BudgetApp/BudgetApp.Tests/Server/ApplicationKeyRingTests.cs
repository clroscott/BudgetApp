using System.Security.AccessControl;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using BudgetApp.Infrastructure.Identity;
using BudgetApp.Server.Configuration;
using BudgetApp.Tests.Integration;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BudgetApp.Tests.Server;

public sealed class ApplicationKeyRingTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "BudgetApp-KeyTests-" + Guid.NewGuid().ToString("N"));
    private readonly X509Certificate2 certificate = Certificate();

    public ApplicationKeyRingTests() => RestrictedDirectory(root);

    [Fact]
    public void RestartAndChangedReleaseDirectoryRetainCookiesMfaAndKeys()
    {
        using var first = Provider(root, certificate, contentRoot: Path.Combine(root, "release-one"));
        var ring = Ring(root);
        ring.Initialize(first);
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "fictional-user"), new Claim("amr", "mfa")], IdentityConstants.ApplicationScheme);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), new AuthenticationProperties(), IdentityConstants.ApplicationScheme);
        var cookie = CookieFormat(first).Protect(ticket);
        var code = Protector(first, "BudgetApp.LoginVerification.Code.v1").Protect("012345");
        var before = Directory.GetFiles(root, "key-*.xml");
        using var restarted = Provider(root, certificate, contentRoot: Path.Combine(root, "release-two"));
        ring.Verify(restarted);
        Assert.True(CookieFormat(restarted).Unprotect(cookie)!.Principal.HasClaim("amr", "mfa"));
        Assert.Equal("012345", Protector(restarted, "BudgetApp.LoginVerification.Code.v1").Unprotect(code));
        Assert.Equal(before, Directory.GetFiles(root, "key-*.xml"));
        var keyXml = File.ReadAllText(Assert.Single(before));
        Assert.Contains("encryptedSecret", keyXml);
        Assert.Contains("EncryptedXmlDecryptor", keyXml);
        Assert.DoesNotContain("<masterKey", keyXml);
    }

    [Fact]
    public async Task AntiforgeryTokensSurviveRestart()
    {
        using var first = Provider(root, certificate);
        Ring(root).Initialize(first);
        var context = new DefaultHttpContext { RequestServices = first };
        context.Request.Scheme = "https";
        var tokens = first.GetRequiredService<IAntiforgery>().GetAndStoreTokens(context);
        using var restarted = Provider(root, certificate);
        Ring(root).Verify(restarted);
        var post = new DefaultHttpContext { RequestServices = restarted };
        post.Request.Scheme = "https";
        post.Request.Method = "POST";
        post.Request.Headers.Cookie = $"__Host-KeyTests.Antiforgery={tokens.CookieToken}";
        post.Request.Headers["X-XSRF-TOKEN"] = tokens.RequestToken;
        await restarted.GetRequiredService<IAntiforgery>().ValidateRequestAsync(post);
    }

    [Theory]
    [InlineData("ResetPassword")]
    [InlineData("EmailConfirmation")]
    [InlineData("ChangeEmail:replacement@example.test")]
    public async Task IdentityTokensSurviveRestartAndProtectedBackupRestore(string purpose)
    {
        using var factory = new BudgetAppWebApplicationFactory();
        using var client = factory.CreateAuthenticatedTestClient();
        using var scope = factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = new ApplicationUser { UserName = Guid.NewGuid() + "@example.test", Email = "fictional@example.test", DisplayName = "Fictional key test" };
        Assert.True((await users.CreateAsync(user)).Succeeded);
        using var first = Provider(root, certificate);
        Ring(root).Initialize(first);
        var token = await TokenProvider(first).GenerateAsync(purpose, users, user);
        var backup = Path.Combine(root, "restore");
        RestrictedDirectory(backup);
        foreach (var file in Directory.GetFiles(root, "*.xml").Append(Path.Combine(root, ApplicationKeyRing.ManifestName)))
            File.Copy(file, Path.Combine(backup, Path.GetFileName(file)));
        // Portable wrapping material: a PKCS#12 export, reloaded in memory only.
        using var restoredCertificate = X509CertificateLoader.LoadPkcs12(certificate.Export(X509ContentType.Pfx, "test-only-password"),
            "test-only-password", X509KeyStorageFlags.EphemeralKeySet | X509KeyStorageFlags.Exportable);
        using var restored = Provider(backup, restoredCertificate);
        Ring(backup).Verify(restored);
        Assert.True(await TokenProvider(restored).ValidateAsync(purpose, token, users, user));
        Assert.False(await TokenProvider(restored).ValidateAsync("unrelated-purpose", token, users, user));
    }

    [Fact]
    public void KeyAndWrappingCertificateRotationRetainOldPayloads()
    {
        using var first = Provider(root, certificate);
        Ring(root).Initialize(first);
        var original = Protector(first, "rotation-test").Protect("old value");
        using var nextCertificate = Certificate();
        using (var rotating = Provider(root, nextCertificate, certificate))
        {
            rotating.GetRequiredService<IKeyManager>().CreateNewKey(DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(90));
            Ring(root).Verify(rotating);
            Assert.Equal("old value", Protector(rotating, "rotation-test").Unprotect(original));
        }
        using var restarted = Provider(root, nextCertificate, certificate);
        Ring(root).Verify(restarted);
        Assert.Equal(2, Directory.GetFiles(root, "key-*.xml").Length);
        Assert.Equal("old value", Protector(restarted, "rotation-test").Unprotect(original));
        using var forgottenOldCertificate = Provider(root, nextCertificate);
        Assert.Throws<InvalidOperationException>(() => Ring(root).Verify(forgottenOldCertificate));
        Assert.Equal(2, Directory.GetFiles(root, "key-*.xml").Length);
    }

    [Fact]
    public void DevelopmentAndTestingIgnoreInheritedProductionSettings()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["DataProtection:KeyRingPath"] = root, ["DataProtection:CertificateThumbprint"] = "bad-production-certificate"
        }).Build();
        var devServices = new ServiceCollection();
        var development = ApplicationKeyRing.Register(devServices, config, new EnvironmentStub("Development", root));
        Assert.NotEqual(root, development.DirectoryPath);
        Assert.EndsWith(Path.Combine("BudgetApp", "DataProtection", "Development"), development.DirectoryPath);
        Assert.Equal("BudgetApp.Development.v1", development.ApplicationName);
        var testServices = new ServiceCollection();
        var testing = ApplicationKeyRing.Register(testServices, config, new EnvironmentStub("Testing", root));
        Assert.Null(testing.DirectoryPath);
        Assert.Empty(Directory.GetFiles(root));
        using var provider = testServices.BuildServiceProvider();
        Assert.Equal("test", Protector(provider, "test").Unprotect(Protector(provider, "test").Protect("test")));
    }

    [Fact]
    public void ApplicationDiscriminatorSeparatesEnvironments()
    {
        using var production = Provider(root, certificate);
        Ring(root).Initialize(production);
        var token = Protector(production, "same-purpose").Protect("private");
        using var development = Provider(root, certificate, appName: "BudgetApp.Development.v1");
        Assert.Throws<CryptographicException>(() => Protector(development, "same-purpose").Unprotect(token));
    }

    [Fact]
    public void MissingEmptyOrPartialRingDoesNotGenerateReplacementKeys()
    {
        using var provider = Provider(root, certificate);
        Assert.Throws<InvalidOperationException>(() => Ring(root).Verify(provider));
        Assert.Empty(Directory.GetFiles(root));
        Assert.Throws<InvalidOperationException>(() => Ring(Path.Combine(root, "missing")).Verify(provider));
        Assert.False(Directory.Exists(Path.Combine(root, "missing")));
        Ring(root).Initialize(provider);
        var file = Assert.Single(Directory.GetFiles(root, "key-*.xml"));
        File.Delete(file);
        using var restarted = Provider(root, certificate);
        Assert.Throws<InvalidOperationException>(() => Ring(root).Verify(restarted));
        Assert.Empty(Directory.GetFiles(root, "key-*.xml"));
    }

    [Fact]
    public void MissingWrappingKeyFailsWithoutReplacement()
    {
        using var first = Provider(root, certificate);
        Ring(root).Initialize(first);
        using var wrongCertificate = Certificate();
        using var wrong = Provider(root, wrongCertificate);
        var error = Assert.Throws<InvalidOperationException>(() => Ring(root).Verify(wrong));
        Assert.Null(error.InnerException);
        Assert.Contains("No fresh ring was substituted", error.Message);
        Assert.Single(Directory.GetFiles(root, "key-*.xml"));
    }

    [Fact]
    public void InitializationAndProbeNeverOverwriteExistingFiles()
    {
        using var provider = Provider(root, certificate);
        Ring(root).Initialize(provider);
        var manifest = File.ReadAllText(Path.Combine(root, ApplicationKeyRing.ManifestName));
        Assert.Throws<InvalidOperationException>(() => Ring(root).Initialize(provider));
        Assert.Equal(manifest, File.ReadAllText(Path.Combine(root, ApplicationKeyRing.ManifestName)));
        var probe = Path.Combine(root, "test.keyring-probe");
        Ring(root).WriteProbe(provider, probe);
        Ring(root).VerifyProbe(provider, probe);
        var contents = File.ReadAllText(probe);
        Assert.Throws<IOException>(() => Ring(root).WriteProbe(provider, probe));
        Assert.Equal(contents, File.ReadAllText(probe));
    }

    [Fact]
    public void UnencryptedCorruptOrWrongManifestKeysAreRejectedSafely()
    {
        using var first = Provider(root, certificate);
        Ring(root).Initialize(first);
        var file = Assert.Single(Directory.GetFiles(root, "key-*.xml"));
        var original = File.ReadAllText(file);
        File.WriteAllText(file, "<key><descriptor><masterKey>secret-test-sentinel</masterKey></descriptor></key>");
        using var plain = Provider(root, certificate);
        var error = Assert.Throws<InvalidOperationException>(() => Ring(root).Verify(plain));
        Assert.DoesNotContain("secret-test-sentinel", error.ToString());
        File.WriteAllText(file, "<!DOCTYPE test [<!ENTITY x SYSTEM 'file:///should-not-be-read'>]><key>&x;</key>");
        Assert.Throws<InvalidOperationException>(() => Ring(root).Verify(plain));
        File.WriteAllText(file, original);
        File.WriteAllText(Path.Combine(root, ApplicationKeyRing.ManifestName), "{}");
        using var restarted = Provider(root, certificate);
        Assert.Throws<InvalidOperationException>(() => Ring(root).Verify(restarted));
    }

    [Fact]
    public void BroadWindowsPermissionsAreRejected()
    {
        if (!OperatingSystem.IsWindows()) return;
        using var provider = Provider(root, certificate);
        Ring(root).Initialize(provider);
        var directory = new DirectoryInfo(root);
        var acl = directory.GetAccessControl();
        acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-1-0"), FileSystemRights.Read, AccessControlType.Allow));
        directory.SetAccessControl(acl);
        try { Assert.Throws<InvalidOperationException>(() => Ring(root).Verify(provider)); }
        finally { RestrictedDirectory(root); }
    }

    [Fact]
    public void DeniedWindowsWriteAccessFailsBeforeRotation()
    {
        if (!OperatingSystem.IsWindows()) return;
        using var provider = Provider(root, certificate);
        Ring(root).Initialize(provider);
        var directory = new DirectoryInfo(root);
        var acl = directory.GetAccessControl();
        using var identity = WindowsIdentity.GetCurrent();
        acl.AddAccessRule(new FileSystemAccessRule(identity.User!, FileSystemRights.CreateFiles, AccessControlType.Deny));
        directory.SetAccessControl(acl);
        try { Assert.Throws<InvalidOperationException>(() => Ring(root).Verify(provider)); }
        finally { RestrictedDirectory(root); }
    }

    [Fact]
    public async Task WindowsPowerShellHelpersRestrictAclsRejectUnsafePathsAndRestoreEnvironmentOnFailure()
    {
        if (!OperatingSystem.IsWindows()) return;
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "tools", "KeyRing-Windows.Common.ps1"))) directory = directory.Parent;
        Assert.NotNull(directory);
        var helper = Path.Combine(directory!.FullName, "tools", "KeyRing-Windows.Common.ps1").Replace("'", "''");
        var target = root.Replace("'", "''");
        var command = $$"""
            . '{{helper}}'
            $taskPath = Resolve-KeyRingPath '{{target}}'
            Set-KeyRingRestrictedAcl -Path $taskPath -Directory
            $taskAcl = Get-Acl -LiteralPath $taskPath
            if (-not $taskAcl.AreAccessRulesProtected) { throw 'Directory inheritance not removed.' }
            $taskRules = @($taskAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
            if ($taskRules.Count -ne 3) { throw 'Unexpected restricted permission count.' }
            $taskFile = Join-Path $taskPath 'fictional-private-key-file'
            New-Item -ItemType File -Path $taskFile | Out-Null
            Set-KeyRingRestrictedAcl -Path $taskFile
            $taskFileAcl = Get-Acl -LiteralPath $taskFile
            if (-not $taskFileAcl.AreAccessRulesProtected -or @($taskFileAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])).Count -ne 3) { throw 'Private-file permissions were not restricted.' }
            foreach ($taskBadPath in @('C:', 'C:relative', '\server\share\keys', '{{directory.FullName.Replace("'", "''")}}')) {
                $taskRejected = $false
                try { Resolve-KeyRingPath $taskBadPath | Out-Null } catch { $taskRejected = $true }
                if (-not $taskRejected) { throw 'Unsafe target was accepted.' }
            }
            $env:ASPNETCORE_ENVIRONMENT = 'fictional-original-environment'
            $env:DataProtection__KeyRingPath = 'fictional-original-path'
            $env:DataProtection__DecryptionCertificateThumbprints__9 = 'fictional-original-retained'
            [Environment]::SetEnvironmentVariable('DataProtection__DecryptionCertificateThumbprints__0', $null, 'Process')
            $taskFailed = $false
            try { Invoke-KeyRingCommand -Executable (Join-Path $taskPath 'missing.exe') -KeyRingPath $taskPath -Thumbprint ('A' * 40) -RetainedThumbprints @('B' * 40) -Operation check } catch { $taskFailed = $true }
            if (-not $taskFailed) { throw 'Missing executable did not fail.' }
            if ($env:ASPNETCORE_ENVIRONMENT -ne 'fictional-original-environment' -or $env:DataProtection__KeyRingPath -ne 'fictional-original-path' -or $env:DataProtection__DecryptionCertificateThumbprints__9 -ne 'fictional-original-retained') { throw 'Original environment not restored.' }
            if (Test-Path Env:DataProtection__DecryptionCertificateThumbprints__0) { throw 'Temporary retained setting leaked.' }
            'Helper smoke checks passed (no certificate-store or live-key changes).'
            """;
        var start = new System.Diagnostics.ProcessStartInfo("powershell.exe") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        foreach (var argument in new[] { "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command }) start.ArgumentList.Add(argument);
        using var process = System.Diagnostics.Process.Start(start)!;
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await process.WaitForExitAsync(timeout.Token);
        Assert.True(process.ExitCode == 0, await error);
        Assert.Contains("Helper smoke checks passed", await output);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task WindowsPowerShellHelperPreservesOwnerWithoutWriteOwnerPermission(bool isDirectory)
    {
        if (!OperatingSystem.IsWindows()) return;
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "tools", "KeyRing-Windows.Common.ps1"))) directory = directory.Parent;
        Assert.NotNull(directory);
        var helper = Path.Combine(directory!.FullName, "tools", "KeyRing-Windows.Common.ps1").Replace("'", "''");
        var target = Path.Combine(root, isDirectory ? "modify-only-directory" : "fictional-private-key-file").Replace("'", "''");
        var command = $$"""
            . '{{helper}}'
            $taskDirectory = ${{isDirectory.ToString().ToLowerInvariant()}}
            $taskPath = '{{target}}'
            $taskItemType = if ($taskDirectory) { 'Directory' } else { 'File' }
            New-Item -ItemType $taskItemType -Path $taskPath | Out-Null
            $taskSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
            $taskOwnerBefore = (Get-Acl -LiteralPath $taskPath).GetOwner([Security.Principal.SecurityIdentifier]).Value
            if ($taskOwnerBefore -ne $taskSid.Value) { throw 'Fixture must belong to the test identity.' }
            $taskAcl = if ($taskDirectory) { New-Object Security.AccessControl.DirectorySecurity } else { New-Object Security.AccessControl.FileSecurity }
            $taskInheritance = if ($taskDirectory) { 'ContainerInherit,ObjectInherit' } else { 'None' }
            $taskAcl.SetAccessRuleProtection($true, $false)
            foreach ($taskAllowedSid in @($taskSid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
                $taskRights = if ($taskAllowedSid -eq $taskSid.Value) { 'Modify' } else { 'FullControl' }
                $taskRule = New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.SecurityIdentifier]::new($taskAllowedSid), $taskRights, $taskInheritance, 'None', 'Allow')
                $taskAcl.AddAccessRule($taskRule)
            }
            # Deny WRITE_OWNER explicitly so elevated/group grants cannot mask a regression.
            $taskAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($taskSid, [Security.AccessControl.FileSystemRights]::TakeOwnership, [Security.AccessControl.AccessControlType]::Deny))
            $taskItem = Get-Item -LiteralPath $taskPath
            $taskItem.SetAccessControl($taskAcl)
            Set-KeyRingRestrictedAcl -Path $taskPath -Directory:$taskDirectory
            $taskAfter = Get-Acl -LiteralPath $taskPath
            if ($taskAfter.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $taskOwnerBefore) { throw 'Owner was changed.' }
            if (-not $taskAfter.AreAccessRulesProtected) { throw 'Inheritance was not removed.' }
            $taskRules = @($taskAfter.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
            if ($taskRules.Count -ne 3) { throw 'Unexpected restricted permission count.' }
            $taskExpectedSids = @($taskSid.Value, 'S-1-5-18', 'S-1-5-32-544')
            foreach ($taskRule in $taskRules) {
                if ($taskRule.IdentityReference.Value -notin $taskExpectedSids -or $taskRule.AccessControlType -ne 'Allow' -or $taskRule.FileSystemRights -ne 'FullControl' -or $taskRule.IsInherited) { throw 'Unexpected access grant.' }
                if ($taskRule.InheritanceFlags -ne [Security.AccessControl.InheritanceFlags]$taskInheritance) { throw 'Unexpected inheritance flags.' }
            }
            'Owner-preserving permission checks passed.'
            """;
        var start = new System.Diagnostics.ProcessStartInfo("powershell.exe") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        foreach (var argument in new[] { "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command }) start.ArgumentList.Add(argument);
        using var process = System.Diagnostics.Process.Start(start)!;
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await process.WaitForExitAsync(timeout.Token);
        Assert.True(process.ExitCode == 0, await error);
        Assert.Contains("Owner-preserving permission checks passed", await output);
    }

    [Theory]
    [InlineData("")]
    [InlineData("relative-keys")]
    public void InvalidLocationsAreRejected(string path) => Assert.Throws<InvalidOperationException>(() => ApplicationKeyRing.ValidateLocation(path, root));

    [Fact]
    public void PublishRootAndGitLocationsAreRejected()
    {
        Assert.Throws<InvalidOperationException>(() => ApplicationKeyRing.ValidateLocation(Path.GetPathRoot(root), root));
        Assert.Throws<InvalidOperationException>(() => ApplicationKeyRing.ValidateLocation(Path.Combine(root, "publish", "keys"), root));
        Directory.CreateDirectory(Path.Combine(root, ".git"));
        Assert.Throws<InvalidOperationException>(() => ApplicationKeyRing.ValidateLocation(Path.Combine(root, "keys"), Path.Combine(root, "other-publish")));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-thumbprint")]
    [InlineData("0123456789ABCDEF0123456789ABCDEF0123456Z89")]
    public void InvalidCertificateReferencesAreRejected(string thumbprint) => Assert.Throws<InvalidOperationException>(() => ApplicationKeyRing.NormalizeThumbprint(thumbprint));

    [Fact]
    public void ValidCertificateReferenceIsNormalized() => Assert.Equal(new string('A', 40), ApplicationKeyRing.NormalizeThumbprint(" " + new string('a', 40) + " "));

    private static ApplicationKeyRing Ring(string path) => new("Production", "BudgetApp.Production.v1", path);
    private static IDataProtector Protector(IServiceProvider provider, string purpose) => provider.GetRequiredService<IDataProtectionProvider>().CreateProtector(purpose);
    private static TicketDataFormat CookieFormat(IServiceProvider provider) => new(provider.GetRequiredService<IDataProtectionProvider>().CreateProtector(
        "Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationMiddleware", IdentityConstants.ApplicationScheme, "v2"));
    private static DataProtectorTokenProvider<ApplicationUser> TokenProvider(IServiceProvider services) => new(
        services.GetRequiredService<IDataProtectionProvider>(), Options.Create(new DataProtectionTokenProviderOptions()),
        NullLogger<DataProtectorTokenProvider<ApplicationUser>>.Instance);

    private static ServiceProvider Provider(string path, X509Certificate2 current, X509Certificate2? old = null,
        string appName = "BudgetApp.Production.v1", string? contentRoot = null)
    {
        var services = new ServiceCollection().AddLogging();
        services.AddSingleton<IHostEnvironment>(new EnvironmentStub("Production", contentRoot ?? path));
        ApplicationKeyRing.ConfigureCertificateRing(services, path, appName, current, old is null ? [] : [old]);
        services.AddAntiforgery(options => { options.Cookie.Name = "__Host-KeyTests.Antiforgery"; options.HeaderName = "X-XSRF-TOKEN"; });
        return services.BuildServiceProvider();
    }

    private static X509Certificate2 Certificate()
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=BudgetApp fictional key tests", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var cert = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddDays(3));
        return X509CertificateLoader.LoadPkcs12(cert.Export(X509ContentType.Pfx, "test-only"), "test-only", X509KeyStorageFlags.EphemeralKeySet | X509KeyStorageFlags.Exportable);
    }

    private static void RestrictedDirectory(string path)
    {
        var directory = Directory.CreateDirectory(path);
        if (!OperatingSystem.IsWindows()) return;
        var acl = new DirectorySecurity();
        acl.SetAccessRuleProtection(true, false);
        foreach (var sid in new[] { WindowsIdentity.GetCurrent().User!.Value, "S-1-5-18", "S-1-5-32-544" })
            acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid), FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        directory.SetAccessControl(acl);
    }

    public void Dispose()
    {
        certificate.Dispose();
        var parent = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!Path.GetFullPath(root).StartsWith(parent + "BudgetApp-KeyTests-", StringComparison.Ordinal)) throw new InvalidOperationException("Unsafe test cleanup target.");
        if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
    }

    private sealed class EnvironmentStub(string name, string contentRoot) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "BudgetApp.Server";
        public string ContentRootPath { get; set; } = contentRoot;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
