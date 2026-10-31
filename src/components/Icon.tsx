import type { SVGProps } from 'react'

type IconName = 'home' | 'printer' | 'request' | 'admin' | 'qr' | 'arrow' | 'check' | 'clock' | 'alert' | 'upload' | 'refresh' | 'file' | 'external' | 'menu'

const paths: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5z',
  printer: 'M4 3h16v18H4zM4 7.5h16M10 7.5h4v2l-2 2.2-2-2.2zM7 18h10M9.5 18v-3.5h5V18',
  request: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 5h6M9 12h6m-6 4h4',
  admin: 'M12 3 20 6v5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6zm-3 9 2 2 4-4',
  qr: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h3v3h-3zm4 0h3v7h-7v-3',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-16v6l4 2',
  alert: 'M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2h16a1.4 1.4 0 0 0 1.2-2L12 3Zm0 6v5m0 3h.01',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4',
  refresh: 'M20 7v5h-5M4 17v-5h5m10-2a7 7 0 0 0-12-3L4 12m16 0-3 5a7 7 0 0 1-12-3',
  file: 'M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm8 0v5h5M8 13h8m-8 4h8',
  external: 'M14 4h6v6m-11 3L20 4M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6',
  menu: 'M4 6h16M4 12h16M4 18h16',
}

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d={paths[name]} />
    </svg>
  )
}
