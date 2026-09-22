import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.tsx'

describe('App', () => {
  it('opens on the landing page', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: /open graphiteai/i })).toHaveAttribute('href', '/app')
  })
})
