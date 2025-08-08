class Calculator {
  static createSimulationResult(
    simulation,
    settings,
    resources,
    canPlunder,
    engineer,
    flightData,
    partiesFleetInfo
  ) {
    return new Simulation(
      simulation.result,
      simulation.rounds,
      simulation.lost,
      simulation.remaining,
      settings,
      resources,
      canPlunder,
      engineer,
      flightData,
      partiesFleetInfo
    );
  }

  static getAverageSimulation(simulations) {
    // Define the object to hold the average values
    let average = {
      lost: { attackers: {}, defenders: {} },
      remaining: { attackers: {}, defenders: {} },
      result: { average: 1 },
      rounds: 0,
    };

    // Function to make a sum of all the entities
    let add = function (target, source) {
      for (let player in source) {
        if (!target.hasOwnProperty(player)) target[player] = {};

        for (let type in source[player]) {
          if (!target[player].hasOwnProperty(type)) target[player][type] = 0;

          target[player][type] += source[player][type];
        }
      }
    };

    let simulationCount = simulations.length;

    // Loop the simulations and add up the entities
    for (let i = 0; i < simulationCount; i++) {
      add(average.lost.attackers, simulations[i].lost.attackers);
      add(average.lost.defenders, simulations[i].lost.defenders);
      add(average.remaining.attackers, simulations[i].remaining.attackers);
      add(average.remaining.defenders, simulations[i].remaining.defenders);

      average.rounds += simulations[i].rounds;
    }

    // Function to make an average of all the entities add up to each other
    let calculateAverage = function (players, simulationCount) {
      for (let player in players) {
        for (let type in players[player]) {
          players[player][type] = Math.round(
            players[player][type] / simulationCount
          );
        }
      }
    };

    // Calculate the average values
    calculateAverage(average.lost.attackers, simulationCount);
    calculateAverage(average.lost.defenders, simulationCount);
    calculateAverage(average.remaining.attackers, simulationCount);
    calculateAverage(average.remaining.defenders, simulationCount);

    average.rounds = Math.round(average.rounds / simulationCount);

    return average;
  }

  static getDesiredCaseSimulation(desiredCase, results) {
    const get = (keys, obj) =>
      keys.reduce((acc, curr) => (acc && acc[curr] ? acc[curr] : null), obj);

    let bestMatchingIndex = 0,
      keys = desiredCase.key.split(".");

    for (let i = 1, il = results.length; i < il; i++) {
      if (
        (desiredCase.type === 1 &&
          get(keys, results[i]) > get(keys, results[bestMatchingIndex])) ||
        (desiredCase.type === 0 &&
          get(keys, results[i]) < get(keys, results[bestMatchingIndex]))
      ) {
        bestMatchingIndex = i;
      }
    }

    return bestMatchingIndex;
  }

  static calculate(
    simulations,
    settings,
    resources,
    engineer,
    flightData,
    desiredCases,
    partiesFleetInfo
  ) {
    let results = [],
      outcome = { attackers: 0, defenders: 0, draw: 0 };

    for (let i = 0, il = simulations.length; i < il; i++) {
      let canPlunder = Object.keys(simulations[i].result)[0] === "attackers";
      results.push(
        Calculator.createSimulationResult(
          simulations[i],
          settings,
          resources,
          canPlunder,
          engineer,
          flightData,
          partiesFleetInfo
        )
      );

      for (let outcomeKey in simulations[i].result) {
        outcome[outcomeKey]++;
      }
    }

    let cases = {};

    for (let desiredCase in desiredCases) {
      cases[desiredCase] = Calculator.getDesiredCaseSimulation(
        desiredCases[desiredCase],
        results
      );
    }

    results.push(
      Calculator.createSimulationResult(
        Calculator.getAverageSimulation(simulations),
        settings,
        resources,
        outcome.attackers > 0,
        engineer,
        flightData,
        partiesFleetInfo
      )
    );

    cases.average = results.length - 1;

    for (let side in outcome) {
      outcome[side] =
        Math.round((outcome[side] / simulations.length) * 10000) / 100;
    }

    postMessage({
      response: "result",
      results: results,
      outcome: outcome,
      cases: cases,
    });
  }
}

let entityInfo = {};

onmessage = (e) => {
  entityInfo = e.data[7];

  Calculator.calculate(
    e.data[0], // Simulations
    e.data[1], // Settings
    e.data[2], // Planet resources
    e.data[3], // Defender engineer
    e.data[4], // Flight data
    e.data[5], // Desired cases
    e.data[6] // Parties fleet info
  );
};

class Simulation {
  constructor(
    result,
    rounds,
    entitiesLost,
    entitiesRemaining,
    settings,
    resources,
    canPlunder,
    engineer,
    flightData,
    partiesFleetInfo
  ) {
    this.outcome = Object.keys(result)[0];

    this.rounds = rounds;

    this.entitiesLost = entitiesLost;

    this.entitiesRemaining = entitiesRemaining;

    this.reapers = this.calculateReaperData(settings, partiesFleetInfo);

    this.debris = this.calculateDebris(settings, engineer);

    this.losses = {
      attackers: this.calculateValue("attackers"),
      defenders: this.calculateValue("defenders"),
    };

    this.plunder = this.calculatePlunder(
      settings,
      resources,
      canPlunder,
      partiesFleetInfo
    );

    // These need to be calculated after the debris has been calculated
    this.moonChance = this.calculateMoonChance();
    this.profits = {
      attackers: this.calculateProfits("attackers", flightData),
      defenders: this.calculateProfits("defenders", flightData),
    };

    delete this.reapers;
  }

  getRemainingEntitiesForFleet(party, fleetIndex) {
    return this.entitiesRemaining[party][fleetIndex] !== void 0
      ? this.entitiesRemaining[party][fleetIndex]
      : {};
  }

  getEntityCargoCapacity(entity, entityCount, fleetInfo, settings) {
    let entityCapacity = entityInfo[entity].cargo_capacity;

    if (settings.cargoHyperspaceTechMultiplier > 0) {
      entityCapacity +=
        entityCapacity *
        (settings.cargoHyperspaceTechMultiplier / 100) *
        fleetInfo.techs.hyperspacetech;
    }

    if (
      settings.characterClassesEnabled &&
      fleetInfo.class === "collector" &&
      ["202", "203"].indexOf(entity) >= 0
    ) {
      entityCapacity +=
        entityInfo[entity].cargo_capacity *
        (settings.minerBonusIncreasedCargoCapacityForTradingShips / 100);
    }

    return entityCapacity * entityCount;
  }

  calculateReaperData(settings, partiesFleetInfo) {
    let reaperData = {};

    for (let party in this.entitiesRemaining) {
      reaperData[party] = { count: 0, capacity: 0 };
      for (let i in this.entitiesRemaining[party]) {
        if (this.entitiesRemaining[party][i][218] !== void 0) {
          const reaperCount = this.entitiesRemaining[party][i][218];

          reaperData[party].count += reaperCount;
          reaperData[party].capacity += this.getEntityCargoCapacity(
            218,
            reaperCount,
            partiesFleetInfo[party][i],
            settings
          );
        }
      }
    }

    return reaperData;
  }

  calculateDebris(settings, engineer) {
    let metal = 0,
      crystal = 0,
      deuterium = 0;

    let fleetDebris = settings.fleetDebris / 100,
      defenceDebris = settings.defenceDebris / 100,
      defenceRepair = 1 - settings.defenceRepair / 100;

    if (engineer) defenceRepair /= 2; // Half the losses, which results in less df

    for (let party in this.entitiesLost) {
      for (let i in this.entitiesLost[party]) {
        for (let entity in this.entitiesLost[party][i]) {
          let toDebris =
            entity >= 400 ? defenceDebris * defenceRepair : fleetDebris;
          metal +=
            this.entitiesLost[party][i][entity] *
            entityInfo[entity].resources.metal *
            toDebris;
          crystal +=
            this.entitiesLost[party][i][entity] *
            entityInfo[entity].resources.crystal *
            toDebris;
          deuterium +=
            this.entitiesLost[party][i][entity] *
            entityInfo[entity].resources.deuterium *
            toDebris;
        }
      }
    }

    let result = {
      overall: {
        metal: metal,
        crystal: crystal,
        deuterium: deuterium,
        total: metal + crystal + deuterium,
      },
      reaper: {
        attackers: { metal: 0, crystal: 0, deuterium: 0, total: 0 },
        defenders: { metal: 0, crystal: 0, deuterium: 0, total: 0 },
      },
      remaining: { metal: 0, crystal: 0, deuterium: 0, total: 0 },
    };

    if (settings.combatDebrisFieldLimit > 0) {
      let maxDebrisPercentage = settings.combatDebrisFieldLimit / 100,
        maxDebrisHarvest = Math.floor(
          maxDebrisPercentage * result.overall.total
        ),
        debrisMetalRatio = result.overall.metal / result.overall.total,
        //debrisCrystalRatio = 1 - debrisMetalRatio;
        debrisCrystalRatio = result.overall.crystal / result.overall.total,
        debrisDeuteriumRatio = result.overall.deuterium / result.overall.total;
      console.log(1);
      for (let party in this.reapers) {
        if (this.reapers[party].count > 0) {
          const canHarvest =
            maxDebrisHarvest > this.reapers[party].capacity
              ? this.reapers[party].capacity
              : maxDebrisHarvest;

          result.reaper[party].metal = Math.floor(
            canHarvest * debrisMetalRatio
          );
          result.reaper[party].crystal = Math.floor(
            canHarvest * debrisCrystalRatio
          );
          if (settings.deuteriumInDebris == 1)
            result.reaper[party].deuterium = Math.floor(
              canHarvest * debrisDeuteriumRatio
            );
          result.reaper[party].total =
            result.reaper[party].metal + result.reaper[party].crystal;
        }
      }
    }

    result.remaining.metal =
      result.overall.metal -
      result.reaper.attackers.metal -
      result.reaper.defenders.metal;
    result.remaining.crystal =
      result.overall.crystal -
      result.reaper.attackers.crystal -
      result.reaper.defenders.crystal;
    if (settings.deuteriumInDebris == 1)
      result.remaining.deuterium =
        result.overall.deuterium -
        result.reaper.attackers.deuterium -
        result.reaper.defenders.deuterium;

    result.remaining.total =
      result.overall.total -
      result.reaper.attackers.total -
      result.reaper.defenders.total;

    return result;
  }

  calculateValue(party) {
    let metal = 0,
      crystal = 0,
      deuterium = 0;

    for (let i in this.entitiesLost[party]) {
      for (let entity in this.entitiesLost[party][i]) {
        metal +=
          this.entitiesLost[party][i][entity] *
          entityInfo[entity].resources.metal;
        crystal +=
          this.entitiesLost[party][i][entity] *
          entityInfo[entity].resources.crystal;
        deuterium +=
          this.entitiesLost[party][i][entity] *
          entityInfo[entity].resources.deuterium;
      }
    }

    return {
      metal: metal,
      crystal: crystal,
      deuterium: deuterium,
      total: metal + crystal + deuterium,
    };
  }

  calculatePlunder(settings, resources, canPlunder, partiesFleetInfo) {
    let capacity = 0,
      canBePlundered = JSON.parse(JSON.stringify(resources));

    let metal = 0,
      crystal = 0,
      deuterium = 0;

    if (canPlunder) {
      // Calculate the actual plunder
      for (let resource in canBePlundered) {
        canBePlundered[resource] *= settings.plunder / 100;
      }

      for (let i in this.entitiesRemaining.attackers) {
        for (let entity in this.entitiesRemaining.attackers[i]) {
          capacity += this.getEntityCargoCapacity(
            entity,
            this.entitiesRemaining.attackers[i][entity],
            partiesFleetInfo.attackers[i],
            settings
          );
        }
      }

      // TODO subtract reaper

      let oneThird = capacity / 3;

      // Step 1. Load metal
      if (canBePlundered.metal <= oneThird) {
        metal = canBePlundered.metal;
        canBePlundered.metal = 0;
        capacity -= metal;
      } else {
        metal = oneThird;
        canBePlundered.metal -= oneThird;
        capacity -= oneThird;
      }

      let half = capacity / 2;

      // Step 2. Load crystal
      if (canBePlundered.crystal <= half) {
        crystal = canBePlundered.crystal;
        canBePlundered.crystal = 0;
        capacity -= crystal;
      } else {
        crystal = half;
        canBePlundered.crystal -= half;
        capacity -= half;
      }

      // Step 3. Load deuterium
      if (canBePlundered.deuterium > capacity) {
        deuterium = capacity;
        capacity = 0;
      } else {
        deuterium = canBePlundered.deuterium;
        canBePlundered.deuterium = 0;
        capacity -= deuterium;
      }

      if (capacity > 0) {
        half = capacity / 2;
        // Step 4. Load remaining metal
        if (canBePlundered.metal <= half) {
          metal += canBePlundered.metal;
          capacity -= canBePlundered.metal;
          canBePlundered.metal = 0;
        } else {
          metal += half;
          canBePlundered.metal -= half;
          capacity -= half;
        }

        // Step 5. Load remaining crystal
        if (canBePlundered.crystal > capacity) {
          crystal += capacity;
          capacity = 0;
        } else {
          crystal += canBePlundered.crystal;
          capacity -= canBePlundered.crystal;
          canBePlundered.crystal = 0;
        }
      }

      if (capacity > 0) {
        // Step 6. Load remaining metal
        if (canBePlundered.metal > capacity) {
          metal += capacity;
          capacity = 0;
        } else {
          metal += canBePlundered.metal;
          canBePlundered.metal = 0;
        }
      }

      metal = Math.round(metal);
      crystal = Math.round(crystal);
      deuterium = Math.round(deuterium);
    }

    return {
      metal: metal,
      crystal: crystal,
      deuterium: deuterium,
      total: metal + crystal + deuterium,
    };
  }

  calculateMoonChance() {
    let hypotheticalMoonChance = Math.floor(this.debris.overall.total / 100000);

    return hypotheticalMoonChance > 20 ? 20 : hypotheticalMoonChance;
  }

  calculateProfits(party, flightData) {
    let fuelConsumption = 0;

    for (let player in flightData[party]) {
      if (flightData[party][player].fuelConsumption) {
        fuelConsumption += flightData[party][player].fuelConsumption;
      }
    }

    let metal =
        -this.losses[party].metal +
        this.debris.remaining.metal +
        this.debris.reaper[party].metal,
      crystal =
        -this.losses[party].crystal +
        this.debris.remaining.crystal +
        this.debris.reaper[party].crystal,
      deuterium = -this.losses[party].deuterium - fuelConsumption;

    if (party === "attackers") {
      metal += this.plunder.metal;
      crystal += this.plunder.crystal;
      deuterium += this.plunder.deuterium;
    }

    return {
      metal: metal,
      crystal: crystal,
      deuterium: deuterium,
      total: metal + crystal + deuterium,
    };
  }
}
