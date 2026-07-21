export function ErrorSummary({ errors }: { errors: string[] }) {
  if (errors.length === 0) {
    return null
  }

  return (
    <div className="error-summary" role="alert">
      {errors.map((error) => <p key={error}>{error}</p>)}
    </div>
  )
}
