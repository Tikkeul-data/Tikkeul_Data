import { createApiClient, type RequestOptions } from '../api/client';
import { API_BASE_URL } from '../config';

const client = createApiClient({ baseUrl: API_BASE_URL });

export interface AuthUser {
  id: number;
  email: string;
  email_verified: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export const authApi = {
  signup: (email: string, password: string, options?: RequestOptions) =>
    client.post<TokenResponse>('/api/auth/signup', { email, password }, options),
  login: (email: string, password: string, options?: RequestOptions) =>
    client.post<TokenResponse>('/api/auth/login', { email, password }, options),
  me: (token: string, options?: RequestOptions) => client.get<AuthUser>('/api/auth/me', {}, { ...options, token }),
  checkEmail: (email: string, options?: RequestOptions) =>
    client.get<{ available: boolean }>('/api/auth/check-email', { email }, options),
  sendVerification: (token: string, options?: RequestOptions) =>
    client.post<{ sent: boolean }>('/api/auth/send-verification', {}, { ...options, token }),
};
