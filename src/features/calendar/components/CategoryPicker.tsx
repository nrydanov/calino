import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Category } from '@/types/categories'
import styles from './EventModal.module.css'

/** Up to this many categories are shown as chips to toggle; more are searched. */
export const CATEGORY_CHIP_LIMIT = 12

interface CategoryPickerProps {
  categories: Category[]
  selected: string[]
  onChange: (selected: string[]) => void
}

/**
 * The categories of an event. A few are all shown as chips to toggle. Past
 * `CATEGORY_CHIP_LIMIT` only the chosen ones are shown; "+ Category" opens a
 * search whose matches are chips on the row below, at most the same number.
 */
export function CategoryPicker({
  categories,
  selected,
  onChange,
}: CategoryPickerProps): JSX.Element {
  const { t } = useTranslation('calendar')
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!searching) return
    const onPointerDown = (e: MouseEvent): void => {
      if (!searchRef.current?.contains(e.target as Node)) setSearching(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [searching])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return categories.filter(
      (cat) => !selected.includes(cat.name) && cat.name.toLowerCase().includes(q)
    )
  }, [categories, selected, query])

  const toggle = (name: string): void => {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name])
  }
  const choose = (name: string): void => {
    onChange([...selected, name])
    setQuery('')
  }

  const chip = (cat: Category): JSX.Element => (
    <button
      key={cat.id}
      type="button"
      aria-pressed={selected.includes(cat.name)}
      className={`${styles.categoryChip} ${
        selected.includes(cat.name) ? styles.categoryChipSelected : ''
      }`}
      onClick={() => toggle(cat.name)}
    >
      <span className={styles.categoryChipDot} style={{ backgroundColor: cat.color }} />
      {cat.name}
    </button>
  )

  if (categories.length <= CATEGORY_CHIP_LIMIT) {
    return <div className={styles.categoriesList}>{categories.map(chip)}</div>
  }

  return (
    <div ref={searchRef} className={styles.categoryPicker}>
      <div className={styles.categoriesList}>
        {categories.filter((cat) => selected.includes(cat.name)).map(chip)}
        {searching ? (
          <input
            type="text"
            aria-label={t('modals.eventModal.searchCategories')}
            autoFocus
            placeholder={t('modals.eventModal.searchCategories')}
            value={query}
            className={styles.categorySearchInput}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches.length > 0) {
                e.preventDefault()
                choose(matches[0].name)
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                setSearching(false)
              }
            }}
          />
        ) : (
          <button type="button" className={styles.categoryChip} onClick={() => setSearching(true)}>
            {t('modals.eventModal.addCategory')}
          </button>
        )}
      </div>
      {searching && matches.length > 0 && (
        <div className={styles.categoriesList}>
          {matches.slice(0, CATEGORY_CHIP_LIMIT).map(chip)}
        </div>
      )}
    </div>
  )
}
