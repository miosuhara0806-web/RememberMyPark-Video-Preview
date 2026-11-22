(() => {
  "use strict";

  const save = window.ParkSave;
  const puzzles = window.ParkPuzzles;
  const state = save.fresh();
  for (const [id, facility] of Object.entries(state.facilities)) {
    facility.started = true;
    facility.index = 1;
    facility.rounds.forEach((round, index) => {
      const puzzle = puzzles.puzzles[id][index];
      if (puzzle.kind === "train") round.rotations = puzzles.routeRotations(puzzle);
      else round.values = [...puzzle.solution];
      round.solved = round.cleared = true;
    });
  }
  state.restored = save.restoredFrom(state.facilities);
  state.lightCount = state.restored.length;

  // プロジェクトサイトは正式版と同じホストに載るため、永続ストレージを使わない。
  let record = JSON.stringify(save.validate(state));
  const memory = { getItem: () => record, setItem: (_key, value) => { record = value; } };
  const { load, write } = save;
  save.load = () => load(memory);
  save.write = value => write(value, memory);
  if (!location.hash) history.replaceState(null, "", "#ending");

  const $ = id => document.getElementById(id);
  const video = $("ending-video");
  const source = new URL(window.PARK_CONFIG.ending.video, document.baseURI);
  const info = [source.href, `MP4の形式対応 ${video.canPlayType("video/mp4") || "応答なし"}`];
  let delivery = [];
  const events = [];

  function showResults() {
    $("preview-diagnostics").textContent = [...info, ...delivery, ...events].join("\n");
  }

  function recordEvent(message) {
    events.push(message);
    if (events.length > 16) events.shift();
    showResults();
  }

  video.addEventListener("loadedmetadata", () => {
    recordEvent(`メタデータ取得 ${video.videoWidth}×${video.videoHeight} / ${video.duration.toFixed(2)}秒`);
  });
  video.addEventListener("playing", () => recordEvent("再生開始"));
  video.addEventListener("ended", () => recordEvent("自然終了"));
  video.addEventListener("stalled", () => recordEvent("動画の受信が停止"));
  video.addEventListener("error", () => {
    if (video.error) recordEvent(`動画エラー ${video.error.code} ${video.error.message}`);
  });
  // 同じタップの中で元の play() を呼び、結果の表示にだけ使う。
  const nativePlay = video.play;
  video.play = function play() {
    const result = nativePlay.call(this);
    result?.catch(error => {
      if (error.name !== "AbortError") recordEvent(`再生開始エラー ${error.name}`);
    });
    return result;
  };

  async function probe(method, range) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const label = range ? `${method} ${range}` : method;
    try {
      const response = await fetch(source, {
        method, headers: range ? { Range: range } : {}, cache: "no-store", signal: controller.signal
      });
      const type = response.headers.get("content-type") ?? "形式なし";
      const contentRange = response.headers.get("content-range");
      const length = response.headers.get("content-length");
      const result = [`${label}　HTTP ${response.status}`, type];
      if (contentRange) result.push(contentRange);
      if (length) result.push(`Content-Length ${length}`);
      if (range && response.status === 206) result.push(`受信 ${(await response.arrayBuffer()).byteLength}バイト`);
      else await response.body?.cancel();
      return result.join(" / ");
    } catch (error) {
      return `${label}　取得失敗 (${error.name})`;
    } finally {
      clearTimeout(timeout);
    }
  }

  $("check-delivery").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    delivery = ["配信を確認中…"];
    showResults();
    delivery = await Promise.all([probe("HEAD"), probe("GET", "bytes=0-1"), probe("GET", "bytes=-16")]);
    showResults();
    button.disabled = false;
  });

  $("copy-diagnostics").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("preview-diagnostics").textContent);
      $("copy-status").textContent = "診断結果をコピーしました。";
    } catch {
      $("copy-status").textContent = "下の診断結果を選択してコピーできます。";
    }
  });
  showResults();
})();
