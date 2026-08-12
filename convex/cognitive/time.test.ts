import { GameTime, dateToGameMinute, minutesToDate, toGameMinutes } from './time';

describe('GameTime', () => {
  test('converts real duration to game minutes with compression', () => {
    expect(toGameMinutes(1000, { gameMinutesPerRealSecond: 2 })).toBe(2);
    expect(toGameMinutes(30_000, { gameMinutesPerRealSecond: 2 })).toBe(60);
  });

  test('minutesToDate roundtrips', () => {
    expect(minutesToDate(0)).toEqual({ day: 0, hour: 0, minute: 0 });
    expect(minutesToDate(61)).toEqual({ day: 0, hour: 1, minute: 1 });
    expect(minutesToDate(1440)).toEqual({ day: 1, hour: 0, minute: 0 });
    expect(minutesToDate(1500)).toEqual({ day: 1, hour: 1, minute: 0 });
    expect(dateToGameMinute(minutesToDate(1500))).toBe(1500);
  });

  test('now() derives game date from base timestamp', () => {
    const base = 1_000_000;
    // 1 game minute per real minute: 1 real hour -> 60 game minutes.
    const clock = new GameTime(base, { gameMinutesPerRealSecond: 1 / 60 });
    expect(clock.now(base + 3_600_000)).toEqual({ day: 0, hour: 1, minute: 0 });
  });

  test('startDay shifts the day index', () => {
    // 1 game minute per real minute: 1 real day -> 1 game day.
    const clock = new GameTime(0, { gameMinutesPerRealSecond: 1 / 60, startDay: 7 });
    expect(clock.now(86_400_000)).toEqual({ day: 8, hour: 0, minute: 0 });
    expect(clock.gameMinute(86_400_000)).toBe(1440);
  });

  test('serialize roundtrips', () => {
    const clock = new GameTime(1234, { gameMinutesPerRealSecond: 2.4 });
    const restored = GameTime.deserialize(clock.serialize());
    expect(restored.now(1234 + 600_000)).toEqual(clock.now(1234 + 600_000));
  });
});
