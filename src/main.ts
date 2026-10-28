import { SceneManager } from "./scene/SceneManager";
import { Table } from "./scene/Table";
import { GameController } from "./game/GameController";
import { DebugHud } from "./ui/DebugHud";

/** 致命的エラー時に、真っ白／真っ黒にせず画面にメッセージを出す。 */
function showFatal(message: string): void {
  const el = document.getElementById("app") ?? document.body;
  el.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      font-family:system-ui,sans-serif;color:#5a4a33;background:#f3efe6;padding:24px;text-align:center;">
      <div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">抹茶日和を表示できませんでした</div>
        <div style="font-size:13px;opacity:0.85;white-space:pre-wrap;">${message}</div>
      </div>
    </div>`;
}

/** WebGL が利用可能か確認する。 */
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

function bootstrap(): void {
  const container = document.getElementById("app");
  if (!container) {
    showFatal("#app 要素が見つかりません。");
    return;
  }
  if (!isWebGLAvailable()) {
    showFatal(
      "お使いのブラウザで WebGL が利用できません。\nブラウザのハードウェアアクセラレーションを有効にするか、別のブラウザでお試しください。",
    );
    return;
  }

  // 旧バージョンのヒント表示は GameUI の指示バナーに置き換えるため隠す。
  const staticHint = document.querySelector<HTMLElement>(".hint");
  if (staticHint) staticHint.style.display = "none";

  // シーン・カメラ・レンダラー
  const sceneManager = new SceneManager(container);

  // 木目のテーブル（背景・床）
  const table = new Table();
  sceneManager.add(table.mesh);

  // ゲーム進行（タイトル→抹茶→お湯→点てる→採点）。
  // 茶碗・抹茶・茶筅・液面・泡などの部品はこの中で生成・再利用される。
  const game = new GameController(sceneManager);
  sceneManager.onUpdate((dt) => game.update(dt));

  // 開発時のみ、速度/泡/フェーズの数値を表示する。
  if (import.meta.env.DEV) {
    const hud = new DebugHud();
    sceneManager.onUpdate(() => {
      const d = game.getDebug();
      hud.update(d.speed, d.rawSpeed, d.active, d.foam);
    });

    // 自動テスト／デバッグ用の内部状態フック。
    (window as unknown as Record<string, unknown>).__maccha = {
      getDebug: () => game.getDebug(),
      forceResult: (d: Parameters<typeof game.debugForceResult>[0]) =>
        game.debugForceResult(d),
    };
  }

  sceneManager.start();
}

// 初期化中の予期せぬ例外でも白画面にせず、原因を表示する。
try {
  bootstrap();
} catch (e) {
  const reason = e instanceof Error ? e.message : String(e);
  console.error("[抹茶日和] 初期化に失敗しました:", e);
  showFatal(`初期化に失敗しました。\n${reason}`);
}
