import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initSync } from './sync';
import './index.css';

initSync();

// 새 버전이 배포돼 서비스 워커가 바뀌면 한 번 새로고침해서 바로 새 화면을 보여준다.
// (처음 설치될 때는 바뀐 게 아니므로 건너뛴다)
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
