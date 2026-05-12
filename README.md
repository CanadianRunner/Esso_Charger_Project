# _Esso Pump EV Charger Conversion_

#### By _**Sean Keane**_

#### Application for pump displays -- 01/22/2025

## Technologies Used

* .NET 8 / ASP.NET Core
* Entity Framework Core
* SQLite (Litestream replication)
* SignalR
* React 18
* TypeScript
* Vite
* Tailwind CSS

## Description

This is a personal project I've undertaken that combines my love for software and hardware.  I am converting a restored 1950s gas pump into an electric vehicle charger.  This project goes beyond charging infrastructure; I plan on replacing the rotary dials with cleverly disguised displays that will output the number of kWh delivered, charge cost (based on my home rates), and other relevant metrics.

I plan to update this README with images and my progress as I tackle the unforeseen challenges of bringing this project to life.

## Restored Pump:

![RestoredPump](images/starter_pump.png)

## Update #7 (05/11/2026)

_Phase 6 is complete -- always-on lifecycle and the small touches that make the display feel alive:_

This phase was less about new visual surfaces and more about how the display behaves over time when nobody's actively charging.  Three pieces landed.

**Brightness modes and preview toggle.**  The kiosk display now adjusts brightness based on what's happening: full brightness during charging or session-complete, dimmed to 60% during idle or plugged-but-not-charging, dimmed further to 30% during overnight hours (default 23:00–06:00).  Transitions fade smoothly via CSS over a little over a second.  A `?preview=true` URL parameter brings back all the dev artifacts (zone labels, the `$`/`SALE` flank labels, a bottom debug strip) for layout work; without it, only the values inside the cutouts render -- matching the production-kiosk view since the static labels will be vinyl stickers on the actual pump face.

**Burn-in mitigation.**  Outdoor displays running 24/7 for years can hold static content into the panel permanently, so every 60 seconds the entire kiosk container shifts by ±1 pixel in a random direction.  Imperceptible to a viewer, but it exercises adjacent pixels.  Once an hour during true idle, all the odometer dials do a "tick-through" exercise -- rolling every digit cell through 0 through 9 once before snapping back to their actual values.  Looks like the pump is checking itself once an hour, and it gives every cell a workout against burn-in.  A `?exercise=now` URL param force-triggers the exercise for visual review.

**Post-session lifecycle.**  When a vehicle unplugs, the display now lingers on the just-completed session's data instead of immediately resetting.  For the first 5 minutes it stays at full brightness with the session totals frozen in place.  For the next 10 minutes it drops to dim brightness with the same data.  After 15 minutes total, the digits briefly fade out and the display resets to a true-idle state.  Any new plug-in during the linger window immediately cancels the lifecycle so the new session takes over without bleed-through -- if my wife plugs in her Tesla three minutes after I unplug my Rivian, the Rivian's data disappears and the Tesla session takes over instantly.  The lingering is purely a frontend UX convenience; a reboot during the window just starts fresh at idle.

Zone 3 (SESSION) also got smarter about what to display in each state.  During true idle (no recent session) it shows a static `[blank] [⚡] R E A D Y [🔌]` readout instead of meaningless zero rotations -- communicates both that the pump is ready and the action you want the user to take.  During the post-session linger window it cycles every 10 seconds through four stats: H:MM:SS duration, kWh delivered, USD cost, and the ✓ Done state -- so someone glancing at the pump within the 15-minute window sees all four post-session numbers cycle by in 40 seconds.

A nice side fix landed too: the `MiniReadout` cell row now splits its content via `Array.from` so multi-byte emoji surrogate pairs (the 🔌 plug, the 🗓️ calendar) count as a single user-perceived character.  Without the change, the 🔌 in READY would have broken into two cells of garbage half-surrogates.

Test count is up to 114 (59 backend + 55 frontend) and CI is green.

Older updates are archived in [UPDATES.md](UPDATES.md).

## Known Bugs

* No known bugs


## License

If you have any questions or concerns feel free to contact me at code@sean-keane.com

*This is licensed under the MIT license*

Copyright (c) 01-22-2025 **_Sean Keane_**
