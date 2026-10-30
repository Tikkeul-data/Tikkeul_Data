// 로그인 토큰 저장. 웹은 localStorage(기존 최근목적지와 같은 패턴), 네이티브는 expo-secure-store.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'tikkeul:authToken';

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // 프라이빗 모드 등으로 저장이 막혀 있으면 조용히 넘어간다 - 로그인 자체는 이번 세션에서 계속 쓸 수 있다.
    }
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
    } catch {
      // 위와 같은 이유로 조용히 넘어간다.
    }
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
