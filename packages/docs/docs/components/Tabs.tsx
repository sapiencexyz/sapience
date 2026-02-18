'use client'

import { useState, Children, isValidElement, type ReactNode, type ReactElement, type MouseEvent } from 'react'

type TabProps = {
  label: string
  children: ReactNode
}

// Simple wrapper - children are rendered by parent
export function Tab({ children }: TabProps) {
  return <>{children}</>
}

type TabsProps = {
  children: ReactNode
}

/**
 * Custom Tabs component for Vocs MDX documentation.
 * 
 * Implementation Notes:
 * 
 * This component uses a display-based approach rather than conditional rendering:
 * - ALL tab panels are rendered in the DOM at all times
 * - Visibility is controlled via CSS `display: none/block`
 * 
 * Why this approach?
 * 
 * 1. MDX Compilation: MDX transforms components during compilation, so checking
 *    `child.type === Tab` fails. Instead, we detect tabs by checking for `props.label`.
 * 
 * 2. CSS Inheritance: Vocs applies typography and spacing styles during MDX processing.
 *    When content is conditionally rendered, it may not inherit these styles consistently.
 *    Keeping all content in the DOM ensures Vocs styles are applied correctly.
 * 
 * 3. Minimal CSS Overrides: With all content always present, we only need one CSS rule
 *    to remove top margin from the first child. Conditional rendering would require
 *    many more CSS overrides for headings, lists, paragraphs, etc.
 * 
 * Key Lesson: When building custom components for MDX-based documentation systems,
 * prefer CSS visibility over conditional rendering for content that needs framework styling.
 */
export default function Tabs({ children }: TabsProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  // Extract tabs from children
  // Note: We check for props.label instead of comparing component types,
  // because MDX transforms components during compilation
  const tabs: { label: string; content: ReactNode }[] = []
  
  Children.forEach(children, (child) => {
    if (isValidElement(child)) {
      const props = (child as ReactElement<TabProps>).props
      if (props?.label) {
        tabs.push({
          label: props.label,
          content: props.children,
        })
      }
    }
  })

  if (tabs.length === 0) return null

  const handleMouseEnter = (e: MouseEvent<HTMLButtonElement>, index: number) => {
    if (index !== activeIndex) {
      e.currentTarget.style.color = 'var(--vocs-color_text)'
    }
  }

  const handleMouseLeave = (e: MouseEvent<HTMLButtonElement>, index: number) => {
    if (index !== activeIndex) {
      e.currentTarget.style.color = 'var(--vocs-color_text3)'
    }
  }

  return (
    <div className="vocs-tabs">
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: '0',
          borderBottom: '1px solid var(--vocs-color_border)',
          marginBottom: '1.25rem',
        }}
      >
        {tabs.map((tab, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={index === activeIndex}
            onClick={() => setActiveIndex(index)}
            style={{
              padding: '0.625rem 1rem',
              background: 'transparent',
              border: 'none',
              borderBottom: index === activeIndex
                ? '2px solid var(--vocs-color_textAccent)'
                : '2px solid transparent',
              color: index === activeIndex
                ? 'var(--vocs-color_textAccent)'
                : 'var(--vocs-color_text3)',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              marginBottom: '-1px',
              transition: 'color 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => handleMouseEnter(e, index)}
            onMouseLeave={(e) => handleMouseLeave(e, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Render ALL panels, toggle visibility via CSS display */}
      {tabs.map((tab, index) => (
        <div
          key={index}
          role="tabpanel"
          style={{ display: index === activeIndex ? 'block' : 'none' }}
        >
          {tab.content}
        </div>
      ))}
    </div>
  )
}
