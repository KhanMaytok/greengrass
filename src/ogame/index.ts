import { entityInfoV7 } from "./entityInfo";
import { Simulator } from "./simulator";

export function simulate(simulations: any, attackers: any, defenders: any, rapidFire: any) {
  return Simulator.simulate(
    simulations,
    attackers,
    defenders,
    rapidFire,
    entityInfoV7
  );
}
