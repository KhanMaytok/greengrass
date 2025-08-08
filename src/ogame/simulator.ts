/**
 * This version of the Party class is optimized for the V8 engine of Chromium using a highly optimized ArrayBuffer
 */
class Party {
  x: number;
  length: number;
  dataBuffer: ArrayBuffer;
  dataBufferShields: ArrayBuffer;
  dataBufferHullPoints: ArrayBuffer;
  entities: DataView;
  entitiesState: DataView;
  entitiesShields: DataView;
  entitiesHullPoints: DataView;
  remaining: number;
  destroyed: number;
  entityInfo: { [index: string]: any };
  remainingEntities: { [index: string]: any };
  lostEntities: { [index: string]: any };

  constructor(length: number) {
    this.x = 0;
    this.length = length;

    // The maximum amount of bytes Chrome can allocate at once is just above ‭2 147 200 000‬. Which is about 536 800 000 ships (4 bytes per ship, per array buffer)
    this.dataBuffer = new ArrayBuffer(2 * length);
    this.dataBufferShields = new ArrayBuffer(4 * length);
    this.dataBufferHullPoints = new ArrayBuffer(4 * length);

    this.entities = new DataView(this.dataBuffer, 0, length); // Uint8 - 1 Byte // The types in this array will always be in order from 202 to ...
    this.entitiesState = new DataView(this.dataBuffer, length, length); // Uint8 - 1 Byte
    this.entitiesShields = new DataView(this.dataBufferShields, 0, 4 * length); // Float32 - 4 Bytes
    this.entitiesHullPoints = new DataView(
      this.dataBufferHullPoints,
      0,
      4 * length
    ); // Float32 - 4 Bytes

    this.remaining = length;
    this.destroyed = 0;
    this.entityInfo = {};

    this.remainingEntities = {};
    this.lostEntities = {};
  }

  loadPlayerEntities(
    index: string,
    weaponLvl: number,
    shieldLvl: number,
    armourLvl: number,
    numbers: { [type: string]: number },
    entityInfo: { [type: string]: any }
  ) {
    this.remainingEntities[index] = {};
    this.lostEntities[index] = {};
    this.entityInfo[index] = {};

    for (let type in numbers) {
      let number = numbers[type] | 0,
        weapon = entityInfo[type].weapon,
        shield = entityInfo[type].shield,
        armour = entityInfo[type].armour;

      let fullShield = Math.floor(shield + shield * 0.1 * shieldLvl),
        HP = Math.floor((armour + armour * 0.1 * armourLvl) * 0.1);

      this.lostEntities[index][type] = 0;

  const subType = Number(type) - 200;

      this.entityInfo[index][subType] = [
        Math.floor(weapon + weapon * 0.1 * weaponLvl),
        fullShield,
        HP,
      ];

      while (number--) {
        //Type, Status, Attack, Shield, HP, maxHP
  this.entities.setUint8(this.x, subType | 0);
  this.entitiesState.setUint8(this.x, 1 | ((Number(index) | 0) << 1)); // At bit 1 the alive flag | from bit 2 the player index
  this.entitiesShields.setFloat32(this.x * 4, fullShield);
  this.entitiesHullPoints.setFloat32(this.x * 4, HP);

  this.x++; // Position next entity
      }
    }
  }

  shootTo(enemies: Party, useRapidFire: boolean, entityInfo: { [type: string]: any }) {
    if (enemies.remaining > 0) {
      // Select a random enemy, set local entities variable, pick random enemy, set local enemy entities
      let random = Math.random,
        entities = this.entities;

      // Calculate remaining entities
      let il = this.remaining,
        i = 0;

      // Predefined rapid fire variables
      let entityRapidFire: { rapidfire_against?: { [key: number]: number } } | false = false,
        entityRapidFireType = 0;

      // Loop all entities
      while (i < il) {
        let type = entities.getUint8(i),
          eType: number | false = false,
          index = this.entitiesState.getUint8(i) >> 1;

        // As the entity types will be ordered only select the rapidfire info on the first occurence
        if (type !== entityRapidFireType) {
          entityRapidFire = entityInfo[type + 200];
          entityRapidFireType = type;
        }

        do {
          // Select a random enemy target
          //var enemyEntity = enemy.entities[];
          let ex = Math.floor(random() * enemies.remaining),
            offsetF32 = ex * 4,
            eIndex = enemies.entitiesState.getUint8(ex) >> 1;

          eType = enemies.entities.getUint8(ex);

          // Make sure the enemy entity is still alive & our entity can attack
          if (
            (enemies.entitiesState.getUint8(ex) & 0x1) === 1 &&
            this.entityInfo[index][type][0] >= 0
          ) {
            const eEntityShield = enemies.entitiesShields.getFloat32(offsetF32);

            let eEntityFullShield = enemies.entityInfo[eIndex][eType][1];

            let attackPower = this.entityInfo[index][type][0]; // Real attack power
            if (attackPower < eEntityFullShield && eEntityShield >= 0) {
              // If the attack is lower than the shield we need to calculate the shield damage / bounce effect
              // Calculate the damage percentage, this percentage will be an integer
              // As an effect of this calculation an entity with an attack power less than 1% of the enemy his full shield, the shot will bounce

              let damagePercentage = (attackPower / eEntityFullShield) * 100;
              if (damagePercentage > 1) {
                const shieldDamagePercentage = Math.floor(damagePercentage);

                let newShield =
                  eEntityShield -
                  shieldDamagePercentage * 0.01 * eEntityFullShield;
                if (
                  newShield === 0 &&
                  damagePercentage > shieldDamagePercentage
                ) {
                  newShield -=
                    (damagePercentage - shieldDamagePercentage) *
                    0.01 *
                    eEntityFullShield;
                }

                enemies.entitiesShields.setFloat32(offsetF32, newShield); // Damage the shield with the calculate damage percentage
              }

              attackPower = 0; // Reset the attack because it was already used on the shield
            } else {
              attackPower -= eEntityShield; // Calculate the remaining attack power after bringing the shield down
              enemies.entitiesShields.setFloat32(offsetF32, -1); // Set shield to 0 because the attack was higher than the shield value, thus the shield was destroyed
            }

            let eHullPoints = enemies.entitiesHullPoints.getFloat32(offsetF32);

            if (attackPower > 0) {
              // If there is still attack power left after hitting the shield -> hit the hull with the remaining power
              enemies.entitiesHullPoints.setFloat32(
                offsetF32,
                (eHullPoints -= attackPower)
              );

              // If HP is below 0, I thinks it's exploded!
              if (eHullPoints <= 0) {
                enemies.entitiesState.setUint8(
                  ex,
                  enemies.entitiesState.getUint8(ex) & ~1
                ); // Clear the alive bit
                enemies.destroyed++;
              }
            }

            // Calculate explosion probability only if HP is below 70%
            if (
              (enemies.entitiesState.getUint8(ex) & 0x1) === 1 &&
              eHullPoints <= enemies.entityInfo[eIndex][eType][2] * 0.7
            ) {
              // Roll a dice on lost HP, if a ship is damaged for 35% there is a chance of 35% that it'll explode
              if (
                random() >=
                eHullPoints / enemies.entityInfo[eIndex][eType][2]
              ) {
                enemies.entitiesState.setUint8(
                  ex,
                  enemies.entitiesState.getUint8(ex) & ~1
                ); // Clear the alive bit
                enemies.destroyed++;
              }
            }
          }

          // Rapid fire is disabled or no rapid fire present against the enemy target, so let our next entity fire
  if (!entityRapidFire || !('rapidfire_against' in entityRapidFire) || entityRapidFire.rapidfire_against === undefined || entityRapidFire.rapidfire_against[eType + 200] === void 0) break;
        } while (
          useRapidFire !== false &&
          entityRapidFire &&
          'rapidfire_against' in entityRapidFire &&
          random() > 1 / (entityRapidFire.rapidfire_against ? entityRapidFire.rapidfire_against[eType + 200] : 1)
        ); // The chance a entity has to repeat fire against another ship

        i++; // Go to next entity
      }
    }
  }

  resetEntities() {
  let newRemaining = this.length - this.destroyed;

    // Loop all our entities, remaining count is always reset
    for (let i = 0, il = this.remaining, x = 0; i < il; i++) {
      const entity = this.entities.getUint8(i),
        index = this.entitiesState.getUint8(i) >> 1;
      // Delete this.entities with the explosion flag
      if ((this.entitiesState.getUint8(i) & 0x1) === 0) {
        if (!this.lostEntities[index][entity + 200]) {
          this.lostEntities[index][entity + 200] = 0;
        }
        this.lostEntities[index][entity + 200]++;
      }
      // Regenerate the shields of the remaining this.entities
      // Override the previous dead entities, this will result in old unneeded entity data at the end of the arraybuffer.
      // But this way we avoid creating new one and assigning it to the old one.
      // So this method will result in a fixed memory size for a simulation instead of a variable one, but it's faster and avoids having 2 large array buffers coexisting during this operation
      else {
        this.entities.setUint8(x, entity);
        this.entitiesState.setUint8(x, 1 | (index << 1));
        this.entitiesShields.setFloat32(
          x * 4,
          this.entityInfo[index][entity][1]
        );
        this.entitiesHullPoints.setFloat32(
          x * 4,
          this.entitiesHullPoints.getFloat32(i * 4)
        );
        x++;
      }
    }

    this.remaining = newRemaining;
  }

  getRemainingEntities() {
    if (this.remaining > 0) {
      let last = this.entities.getUint8(0),
        lastIdx = 0,
        i = 0,
        playerIdx = this.entitiesState.getUint8(i) >> 1;

      for (let il = this.remaining; i < il; i++) {
        const entity = this.entities.getUint8(i);
        if (
          entity !== last ||
          this.entitiesState.getUint8(i) >> 1 !== playerIdx
        ) {
          this.remainingEntities[playerIdx][last + 200] = i - lastIdx;
          lastIdx = i;
          last = entity;
          playerIdx = this.entitiesState.getUint8(i) >> 1;
        }
      }

      this.remainingEntities[playerIdx][last + 200] = i - lastIdx;
    }

    return this.remainingEntities;
  }

  getLostEntities() {
    for (let index in this.lostEntities) {
      for (let type in this.lostEntities[index]) {
        if (this.lostEntities[index][type] === 0)
          delete this.lostEntities[index][type];
      }
    }
    return this.lostEntities;
  }

  clear() {
    this.dataBuffer = new ArrayBuffer(0);
    this.dataBufferShields = new ArrayBuffer(0);
    this.dataBufferHullPoints = new ArrayBuffer(0);
  }
}

class Simulator {
  /**
   *
   * @param data
   * @returns {Party}
   */
  static loadPartyForSimulation(data: any, entityInfo: { [type: string]: any }) {
    let length = 0;

    for (let index in data) {
      for (let entity in data[index].entities) {
        length += data[index].entities[entity] | 0;
      }
    }

    let party = new Party(length);

    for (let index in data) {
      let playerData = data[index];
      party.loadPlayerEntities(
        index,
        playerData.techs.weapon,
        playerData.techs.shield,
        playerData.techs.armour,
        playerData.entities,
        entityInfo
      );
    }

    return party;
  }

  static handleSimulations(
    simulations: number,
    attackersData: any,
    defendersData: any,
    useRapidFire: boolean,
    entityInfo: { [type: string]: any }
  ) {
  let simulationResults: Array<any> = [];

    let attackers = null,
      defenders = null;

    for (let s = 0; s < simulations; s++) {
      attackers = Simulator.loadPartyForSimulation(attackersData, entityInfo);
      defenders = Simulator.loadPartyForSimulation(defendersData, entityInfo);

      let round = 0;

      //console.log("Simulation: " + (s+1));

      do {
        round++;

        //Attacking party shoots
        attackers.shootTo(defenders, useRapidFire, entityInfo);

        //Defending party shoots
        defenders.shootTo(attackers, useRapidFire, entityInfo);

        //Reset attacking party
        attackers.resetEntities();

        //Reset defending party
        defenders.resetEntities();

        //console.log("Round: " + round);
        //console.log("Lost entities attackers:", JSON.parse(JSON.stringify(attackers.lostEntities)));
        //console.log("Lost entities defenders:", JSON.parse(JSON.stringify(defenders.lostEntities)));
      } while (round < 6 && attackers.remaining > 0 && defenders.remaining > 0);

  let result: { draw?: number; attackers?: number; defenders?: number } = { draw: 1 };

  if (attackers.remaining === 0) result = { defenders: 1 };
  else if (defenders.remaining === 0) result = { attackers: 1 };

  simulationResults[s] = {
        lost: {
          attackers: attackers.getLostEntities(),
          defenders: defenders.getLostEntities(),
        },
        remaining: {
          attackers: attackers.getRemainingEntities(),
          defenders: defenders.getRemainingEntities(),
        },
        result: result,
        rounds: round,
      };
    }

    if (attackers) attackers.clear();
    if (defenders) defenders.clear();

    return simulationResults;
  }

  static simulate(
    simulations: number,
    attackersData: any,
    defendersData: any,
    useRapidFire: boolean,
    entityInfo: { [type: string]: any }
  ) {
    return {
      simulations: Simulator.handleSimulations(
        simulations,
        attackersData,
        defendersData,
        useRapidFire,
        entityInfo
      ),
    };
  }
}
export { Simulator };
