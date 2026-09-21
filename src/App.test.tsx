import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.tsx'

describe('App', () => {
  it('opens on the projects page', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /projects/i })).toBeInTheDocument()
  })
})
