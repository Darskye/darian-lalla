// URL params used for screenshots and sharing a specific state:
//   ?t=16      start the animation clock at 16 s (skips the boot sequence)
//   ?y=2400    scroll to 2400 px after load
//   ?img=text  / ?mood=light  override display settings
const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();

export const START_T = Math.max(0, parseFloat(params.get("t")) || 0);
export const START_Y = parseFloat(params.get("y")) || 0;
export const PARAM_IMG = ["image", "text", "pixel"].includes(params.get("img")) ? params.get("img") : null;
export const PARAM_MOOD = ["dark", "light"].includes(params.get("mood")) ? params.get("mood") : null;
