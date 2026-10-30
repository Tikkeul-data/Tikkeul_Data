import type { TFunction } from 'i18next';

import { ApiClientError } from '../api/client';

/** 로그인/가입 화면에 보여줄 오류 문구. 서버 오류 코드를 사람이 읽을 i18n 문구로 바꾼다. */
export function authErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'EMAIL_TAKEN') return t('auth.emailTaken');
    if (error.code === 'INVALID_CREDENTIALS') return t('auth.loginFailed');
    if (error.kind === 'invalid') return t('auth.emailInvalid');
    if (error.kind === 'network' || error.kind === 'timeout') return t('auth.networkError');
  }
  return t('auth.genericError');
}
