import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { Icon } from './Icon'

const storageKey = 'printboard-tour-v1'

const steps = [
  {
    target: 'summary',
    title: '메이커실을 한눈에',
    body: '비어 있는 프린터, 출력 중인 프린터, 점검이 필요한 프린터 수를 먼저 보여 줘요. 메이커실에 가기 전에 여기부터 확인하세요.',
  },
  {
    target: 'printer-card',
    title: '프린터 카드',
    body: '색으로 상태를 구분해요. 초록은 바로 사용 가능, 파랑은 출력 중(남은 시간 표시), 빨강은 점검 필요예요.',
  },
  {
    target: 'printer-card',
    title: '현장에서는 QR로 바꾸기',
    body: '프린터 앞 QR을 찍으면 그 프린터의 상태 변경 화면이 열려요. 출력을 시작하거나 끝냈을 때, 고장을 발견했을 때 로그인 없이 바로 바꿔 주세요. 장난을 막으려고 상태 변경은 현장 QR로만 할 수 있고, 카드를 누르면 상태와 기록을 볼 수 있어요.',
  },
  {
    target: 'realtime',
    title: '바로 반영돼요',
    body: '누군가 상태를 바꾸면 새로고침하지 않아도 모든 화면에 바로 보여요.',
  },
  {
    target: 'nav-request',
    title: '출력 도움 요청',
    body: '직접 출력하기 어렵다면 3MF 파일을 올려 도움을 요청하세요. 접수는 프린터 예약이 아니고, 담당자가 현장 상황을 보고 처리해요.',
  },
  {
    target: 'nav-track',
    title: '접수 조회',
    body: '요청하면 받는 접수번호와 학번으로 처리 상태를 언제든 확인할 수 있어요.',
  },
]

type Rect = { top: number; left: number; width: number; height: number }

const pad = 8
const gap = 12
const margin = 16

function readSeen() {
  try {
    return window.localStorage.getItem(storageKey) === 'done'
  } catch {
    return false
  }
}

function writeSeen() {
  try {
    window.localStorage.setItem(storageKey, 'done')
  } catch {
    // 저장이 막힌 브라우저에서는 다음 방문에 다시 보여도 괜찮다
  }
}

function findTarget(name: string) {
  const items = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`))
  return items.find((item) => item.getClientRects().length > 0) ?? null
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function Tour() {
  const { pathname } = useLocation()
  const onBoard = pathname === '/'
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [cardSize, setCardSize] = useState({ width: 340, height: 220 })
  const cardRef = useRef<HTMLDivElement>(null)

  const step = steps[index]
  const last = index === steps.length - 1

  const finish = useCallback(() => {
    writeSeen()
    setOpen(false)
    setRect(null)
  }, [])

  const start = useCallback(() => {
    setIndex(0)
    setRect(null)
    setOpen(true)
  }, [])

  // 첫 방문이면 보드가 그려진 뒤 자동으로 시작한다
  useEffect(() => {
    if (!onBoard || readSeen()) return
    let tries = 0
    const timer = window.setInterval(() => {
      tries += 1
      if (findTarget(steps[0].target)) {
        window.clearInterval(timer)
        start()
      } else if (tries > 40) {
        window.clearInterval(timer)
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [onBoard, start])

  // 보드를 떠나면 투어를 닫는다
  useEffect(() => {
    if (!onBoard && open) finish()
  }, [onBoard, open, finish])

  const measure = useCallback(() => {
    const target = findTarget(steps[index].target)
    if (!target) {
      setRect(null)
      return
    }
    const box = target.getBoundingClientRect()
    setRect({ top: box.top, left: box.left, width: box.width, height: box.height })
  }, [index])

  // 단계가 바뀌면 대상을 찾아 화면 가운데로 스크롤하고 위치를 잰다
  useEffect(() => {
    if (!open) return
    let cancelled = false
    let tries = 0
    let timer = 0
    const locate = () => {
      if (cancelled) return
      const target = findTarget(steps[index].target)
      if (!target) {
        tries += 1
        if (tries < 20) timer = window.setTimeout(locate, 150)
        else setRect(null)
        return
      }
      const smooth = !prefersReducedMotion()
      target.scrollIntoView({ block: 'center', inline: 'center', behavior: smooth ? 'smooth' : 'auto' })
      measure()
      timer = window.setTimeout(measure, smooth ? 420 : 30)
    }
    locate()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, index, measure])

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!open || !card) return
    const width = card.offsetWidth
    const height = card.offsetHeight
    if (width !== cardSize.width || height !== cardSize.height) setCardSize({ width, height })
  })

  useEffect(() => {
    if (open) cardRef.current?.focus()
  }, [open, index])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(value + 1, steps.length - 1))
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(value - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, finish])

  if (!onBoard) return null

  if (!open) {
    return createPortal(
      <button className="tour-launcher" type="button" onClick={start} aria-label="사용 가이드 다시 보기">
        <span aria-hidden="true">?</span>
        가이드
      </button>,
      document.body,
    )
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  let cardTop = (viewportHeight - cardSize.height) / 2
  let cardLeft = (viewportWidth - cardSize.width) / 2
  let placement: 'below' | 'above' | 'floating' = 'floating'
  if (rect) {
    const below = rect.top + rect.height + pad + gap
    const above = rect.top - pad - gap - cardSize.height
    if (below + cardSize.height <= viewportHeight - margin) {
      cardTop = below
      placement = 'below'
    } else if (above >= margin) {
      cardTop = above
      placement = 'above'
    } else {
      cardTop = viewportHeight - cardSize.height - margin
    }
    const centered = rect.left + rect.width / 2 - cardSize.width / 2
    cardLeft = Math.min(Math.max(centered, margin), viewportWidth - cardSize.width - margin)
  }

  return createPortal(
    <div className="tour-root">
      <div className={`tour-blocker${rect ? '' : ' dimmed'}`} onClick={(event) => event.stopPropagation()} />
      {rect && (
        <div
          className="tour-spotlight"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      )}
      <div
        ref={cardRef}
        className={`tour-card tour-${placement}`}
        style={{ top: cardTop, left: cardLeft }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
      >
        <div className="tour-card-head">
          <span className="tour-step">{index + 1} / {steps.length}</span>
          <button className="tour-skip" type="button" onClick={finish}>건너뛰기</button>
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body">{step.body}</p>
        <div className="tour-dots" aria-hidden="true">
          {steps.map((item, dot) => <span key={item.title} className={dot === index ? 'active' : ''} />)}
        </div>
        <div className="tour-actions">
          {index > 0 && <button className="button button-outline" type="button" onClick={() => setIndex(index - 1)}>이전</button>}
          <button className="button button-green" type="button" onClick={() => (last ? finish() : setIndex(index + 1))}>
            {last ? '시작하기' : '다음'}
            {!last && <Icon name="arrow" />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
