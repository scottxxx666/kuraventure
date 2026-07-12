import { eventBus } from '../core/EventBus';
import { isTouchDevice } from '../input/VirtualPadSource';
import { i18nService } from '../services/I18nService';
import { getOverlayRoot } from './domOverlay';

/**
 * Landscape-only enforcement (PLAN.md §3.10): a full-screen "rotate your
 * device" cover, created once on touch devices. CSS alone shows it while the
 * viewport is portrait (`@media (orientation: portrait)`) and it blocks all
 * input underneath; Android additionally hard-locks via ui/fullscreen.ts.
 */
export function createRotateOverlayIfTouch(): void {
    if (!isTouchDevice()) {
        return;
    }
    const root = document.createElement('div');
    root.className = 'rotate-overlay';

    const phone = document.createElement('div');
    phone.className = 'rotate-phone';
    const text = document.createElement('div');
    const render = (): void => {
        text.textContent = i18nService.t('rotate.prompt');
    };
    render();
    eventBus.on('locale:changed', render);

    root.append(phone, text);
    getOverlayRoot().appendChild(root);
}
