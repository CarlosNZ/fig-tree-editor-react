import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React Testing Library unmounts between tests by itself only when the runner
// exposes `afterEach` as a global, which vitest doesn't by default
afterEach(cleanup)

// jsdom does no layout, so it leaves scrollIntoView unimplemented. Select
// calls it to keep the current and highlighted options in view
Element.prototype.scrollIntoView = () => {}
