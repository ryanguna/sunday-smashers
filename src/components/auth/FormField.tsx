import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const fieldBaseClasses =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-4 py-2.5 text-[var(--color-plum)] placeholder:text-[var(--color-ink-muted)] shadow-[var(--shadow-soft)] transition focus:border-[var(--color-brand-pink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-pink-light)] disabled:cursor-not-allowed disabled:opacity-60'

export interface FieldWrapperProps {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>
}

export function FieldWrapper({ label, htmlFor, error, hint, required, children, labelProps }: FieldWrapperProps) {
  return (
    <div className="mb-4">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-semibold text-[var(--color-plum)]"
        {...labelProps}
      >
        {label}
        {required && <span className="ml-0.5 text-[var(--color-brand-pink-dark)]">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  )
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export function TextField({ label, error, hint, id, required, className, ...rest }: TextFieldProps) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <input
        id={fieldId}
        required={required}
        aria-invalid={!!error}
        className={cn(fieldBaseClasses, error && 'border-[var(--color-danger)]', className)}
        {...rest}
      />
    </FieldWrapper>
  )
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  hint?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export function SelectField({
  label,
  error,
  hint,
  id,
  required,
  className,
  options,
  placeholder,
  ...rest
}: SelectFieldProps) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <select
        id={fieldId}
        required={required}
        aria-invalid={!!error}
        className={cn(fieldBaseClasses, error && 'border-[var(--color-danger)]', className)}
        {...rest}
      >
        <option value="" disabled hidden>
          {placeholder ?? 'Select…'}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  )
}
