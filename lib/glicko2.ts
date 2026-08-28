export type Rating = {
  rating: number;
  deviation: number;
  volatility: number;
};

const SCALE = 173.7178;
const DEFAULT_TAU = 0.5;
const EPSILON = 0.000001;

export function updateGlicko2(
  player: Rating,
  opponent: Rating,
  score: 0 | 0.5 | 1,
): Rating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.deviation / SCALE;
  const opponentMu = (opponent.rating - 1500) / SCALE;
  const opponentPhi = opponent.deviation / SCALE;
  const g = 1 / Math.sqrt(1 + (3 * opponentPhi ** 2) / Math.PI ** 2);
  const expectation = 1 / (1 + Math.exp(-g * (mu - opponentMu)));
  const variance = 1 / (g ** 2 * expectation * (1 - expectation));
  const delta = variance * g * (score - expectation);
  const sigmaPrime = solveVolatility(phi, player.volatility, delta, variance);
  const phiStar = Math.sqrt(phi ** 2 + sigmaPrime ** 2);
  const phiPrime = 1 / Math.sqrt(1 / phiStar ** 2 + 1 / variance);
  const muPrime = mu + phiPrime ** 2 * g * (score - expectation);

  return {
    rating: round(muPrime * SCALE + 1500, 2),
    deviation: round(Math.min(350, phiPrime * SCALE), 2),
    volatility: round(sigmaPrime, 6),
  };
}

function solveVolatility(phi: number, sigma: number, delta: number, variance: number): number {
  const a = Math.log(sigma ** 2);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const top = ex * (delta ** 2 - phi ** 2 - variance - ex);
    const bottom = 2 * (phi ** 2 + variance + ex) ** 2;
    return top / bottom - (x - a) / DEFAULT_TAU ** 2;
  };

  let lower = a;
  let upper: number;
  if (delta ** 2 > phi ** 2 + variance) {
    upper = Math.log(delta ** 2 - phi ** 2 - variance);
  } else {
    let k = 1;
    while (f(a - k * DEFAULT_TAU) < 0) k += 1;
    upper = a - k * DEFAULT_TAU;
  }

  let fLower = f(lower);
  let fUpper = f(upper);
  while (Math.abs(upper - lower) > EPSILON) {
    const candidate = lower + ((lower - upper) * fLower) / (fUpper - fLower);
    const fCandidate = f(candidate);
    if (fCandidate * fUpper <= 0) {
      lower = upper;
      fLower = fUpper;
    } else {
      fLower /= 2;
    }
    upper = candidate;
    fUpper = fCandidate;
  }

  return Math.exp(lower / 2);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
