/**
 * ハイドレーション前に localStorage → `.dark` クラスを当てて FOUC を防ぐスクリプト。
 *
 * layout.tsx と global-error.tsx の 2 か所で必要になる（global-error はルートレイアウトごと
 * 置き換わるため、layout.tsx のスクリプトが走らない）。片方だけ直す事故を避けるため定数を共有する。
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('theme-mode');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(m==='dark'||(!m&&d)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})()`;
