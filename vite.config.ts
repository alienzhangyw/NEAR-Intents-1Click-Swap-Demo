import { defineConfig } from 'vite';

function resolveBase(): string {
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repo) {
    return '/';
  }
  return `/${repo}/`;
}

export default defineConfig({
  base: resolveBase(),
});
