import { useEffect, useState } from "react";

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const zone = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "short" });

export default function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const tz = zone.formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "ET";
  return (
    <div className="clock">
      <div>USA / {tz}</div>
      <div>{fmt.format(now).replace(",", "")}</div>
    </div>
  );
}
