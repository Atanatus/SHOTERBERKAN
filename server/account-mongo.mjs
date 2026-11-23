// Only server-side. Importing this module does NOT initialize a MongoDB connection.
export function mongoAccountStore(collection, {verifiedRuns} = {}) {
  if (!collection || typeof collection.findOneAndUpdate !== 'function') throw new TypeError('MongoDB collection required');
  return Object.freeze({
    async getOrCreate(uid, defaults) {
      // Unique MongoDB _id: concurrent first logins can only create one account.
      // No request-body fields are written; XP, age, permissions and rank never originate in a browser.
      if (defaults?._id !== uid) throw new TypeError('Identificador inconsistente');
      const {_id, ...insertDefaults} = defaults;
      const record = await collection.findOneAndUpdate(
        {_id: uid}, {$setOnInsert: insertDefaults},
        {upsert: true, returnDocument: 'after'}
      );
      if (!record) throw new Error('Cuenta no recuperada');
      if (!verifiedRuns) return record;
      // Receipts are unique by run ID. Rebuilding the projection cannot double-count a retry.
      const [progress] = await verifiedRuns.aggregate([
        {$match:{uid,status:'REPLAY_CONSISTENT_NOT_ANTICHEAT',arcadeProgress:{$exists:true}}},
        {$group:{_id:null,bestScore:{$max:'$arcadeProgress.bestScore'},
          coresDetonated:{$sum:'$arcadeProgress.coresDetonated'},
          relicSets:{$addToSet:'$arcadeProgress.unlockedRelics'}}},
        {$project:{_id:0,bestScore:1,coresDetonated:1,unlockedRelics:{
          $reduce:{input:'$relicSets',initialValue:[],in:{$setUnion:['$$value','$$this']}}
        }}}
      ]).toArray();
      return progress ? {...record,arcadeProgress:progress} : record;
    }
  });
}
