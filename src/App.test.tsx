import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App.tsx'

describe('App', () => {
  it('increments the counter on click', async () => {
    render(<App />)
    const button = screen.getByRole('button', { name: /count is 0/i })
    await userEvent.click(button)
    expect(button).toHaveTextContent('Count is 1')
  })
})
