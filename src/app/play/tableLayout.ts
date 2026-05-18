export type SeatZone = "left" | "top" | "right" | "bottom";

const SEAT_OVAL_CENTER_X = 50;
const SEAT_OVAL_CENTER_Y = 50.6;
const SEAT_OVAL_RADIUS_X = 43.8;
const SEAT_OVAL_RADIUS_Y = 40.7;
const SIDE_SEAT_EDGE_X = 2;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundSeatPercent(value: number) {
  return Math.round(value * 10) / 10;
}

function seatZoneForPoint(x: number, y: number): SeatZone {
  if (y >= SEAT_OVAL_CENTER_Y + SEAT_OVAL_RADIUS_Y * 0.58) return "bottom";
  if (x <= 7) return "left";
  if (x >= 93) return "right";
  return "top";
}

export function humanSeatPos(): { x: number; y: number; zone: SeatZone } {
  return {
    x: SEAT_OVAL_CENTER_X,
    y: roundSeatPercent(SEAT_OVAL_CENTER_Y + SEAT_OVAL_RADIUS_Y),
    zone: "bottom",
  };
}

export function seatPos(playerIdx: number, playerCount: number): { x: number; y: number; zone: SeatZone } {
  const seats = Math.max(1, playerCount);
  const slot = clamp(playerIdx, 0, seats - 1);
  const angle = Math.PI / 2 + (slot / seats) * Math.PI * 2;
  const x = roundSeatPercent(SEAT_OVAL_CENTER_X + SEAT_OVAL_RADIUS_X * Math.cos(angle));
  const y = roundSeatPercent(SEAT_OVAL_CENTER_Y + SEAT_OVAL_RADIUS_Y * Math.sin(angle));
  const zone = seatZoneForPoint(x, y);
  const anchoredX =
    zone === "left" ? SIDE_SEAT_EDGE_X : zone === "right" ? 100 - SIDE_SEAT_EDGE_X : x;

  return { x: roundSeatPercent(anchoredX), y, zone };
}

export function seatDensity(playerCount: number) {
  if (playerCount >= 9) return "dense";
  if (playerCount >= 7) return "compact";
  return "normal";
}
