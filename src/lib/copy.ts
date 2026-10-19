import { settings } from './settings';
import { copyText, type CopyKey } from '../../shared/copy';

/** Надпись сайта: изменённая в админке («Тексты сайта») или стандартная */
export const t = (key: CopyKey) => copyText(settings.copy, key);
