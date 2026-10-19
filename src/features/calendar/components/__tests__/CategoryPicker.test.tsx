import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CATEGORY_CHIP_LIMIT, CategoryPicker } from '../CategoryPicker'

const categories = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `c${i}`, name: `Cat ${i}`, color: '' }))

describe('CategoryPicker', () => {
  it('shows every category as a chip up to the limit', () => {
    render(
      <CategoryPicker
        categories={categories(CATEGORY_CHIP_LIMIT)}
        selected={[]}
        onChange={() => {}}
      />
    )
    expect(screen.getAllByRole('button')).toHaveLength(CATEGORY_CHIP_LIMIT)
  })

  it('past the limit shows the chosen ones and finds the rest by typing', async () => {
    const onChange = vi.fn()
    render(
      <CategoryPicker
        categories={categories(CATEGORY_CHIP_LIMIT + 1)}
        selected={['Cat 0']}
        onChange={onChange}
      />
    )
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Cat 0',
      expect.any(String),
    ])

    await userEvent.click(screen.getAllByRole('button')[1])
    await userEvent.type(screen.getByRole('textbox'), '12{Enter}')

    expect(onChange).toHaveBeenCalledWith(['Cat 0', 'Cat 12'])
  })
})
