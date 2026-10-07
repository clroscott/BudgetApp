import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RouterProvider } from '../routing/RouterProvider'
import { LoginVerificationReminder } from './LoginVerificationReminder'

describe('dashboard security reminder', () => {
  it('links an unenrolled user directly to personal account settings', () => {
    render(<RouterProvider><LoginVerificationReminder enabled={false} /></RouterProvider>)
    expect(screen.getByRole('link', { name: 'Set up MFA' }).getAttribute('href')).toBe('/settings/account')
    expect(screen.getByRole('heading', { name: 'Add protection to your account' })).toBeTruthy()
  })
  it('does not show a contradictory reminder for an enrolled user', () => {
    render(<RouterProvider><LoginVerificationReminder enabled /></RouterProvider>)
    expect(screen.queryByRole('link', { name: 'Set up MFA' })).toBeNull()
  })
})
