/** Formatting helpers and asset paths shared by the UI. */

export const UI = (path: string) => `${import.meta.env.BASE_URL}assets/ui/2x/${path}`

export const formatClock = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const endReasonLabel = (reason: 'time_up' | 'destroyed'): string => (reason === 'time_up' ? 'Time up' : 'Ship destroyed')

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
/** Local date and time, e.g. "08 SEP · 21:42". Tests pin the time zone for stable screenshots. */
export const formatPlayedAt = (iso: string): string => dateFormat.format(new Date(iso)).replace(',', ' ·').toUpperCase()
