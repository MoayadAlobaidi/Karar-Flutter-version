import { SHELL_TITLE } from './shell';

const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  const placeholder = document.createElement('div');
  placeholder.textContent = SHELL_TITLE;
  root.append(placeholder);
}
