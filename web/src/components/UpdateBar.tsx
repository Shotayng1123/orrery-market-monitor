import { useUpdate } from "../lib/update";

/** "A new version is ready": shown on every screen, sign-in included, when a newer build than this page has been
 *  published (lib/update.ts). Update loads it and keeps the tab the reader was on. */
export function UpdateBar() {
  const u = useUpdate();
  if (!u.id) return null;
  return (
    <div id="updbar" role="status">
      <span>A new version is ready.</span>
      <button type="button" onClick={u.apply}>Update</button>
    </div>
  );
}
