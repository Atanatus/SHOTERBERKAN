// V47 persistent run receipt and offline verifier lease adapter.
// Not wired into the production API. MongoDB single-document CAS is atomic.
export function mongoRunStore(collection) {
  if (!collection || typeof collection.insertOne!=='function' ||
      typeof collection.findOne!=='function' || typeof collection.updateOne!=='function') {
    throw new TypeError('Collection is required');
  }
  return Object.freeze({
    async insert(session) { await collection.insertOne(session); },
    async find(id) { return collection.findOne({_id:id}); },
    async claim(id, uid, at, record) {
      const result=await collection.updateOne(
        {_id:id,uid,status:'ISSUED',expiresAt:{$gt:at}},
        {$set:{status:'PENDING_INDEPENDENT_VERIFICATION',submittedAt:at,...record}}
      );
      return result.modifiedCount===1;
    },
    async claimVerification(id,leaseId,at,leaseMs,maxAttempts=3) {
      if (typeof collection.findOneAndUpdate !== 'function') throw new TypeError('Verifier requires atomic findOneAndUpdate');
      return collection.findOneAndUpdate(
        {_id:id,
          $and:[
            {$or:[{status:'PENDING_INDEPENDENT_VERIFICATION'},
              {status:'VERIFYING',verificationLeaseUntil:{$lte:at}}]},
            {$or:[{verificationAttempts:{$exists:false}},
              {verificationAttempts:{$lt:maxAttempts}}]}
          ]},
        {$set:{status:'VERIFYING',verificationLeaseId:leaseId,
            verificationLeaseUntil:new Date(at.getTime()+leaseMs)},
          $inc:{verificationAttempts:1}},
        {returnDocument:'after'}
      );
    },
    async completeVerification(id,leaseId,fields) {
      const result=await collection.updateOne(
        {_id:id,status:'VERIFYING',verificationLeaseId:leaseId},
        {$set:fields,$unset:{verificationLeaseId:'',verificationLeaseUntil:''}}
      );
      return result.modifiedCount===1;
    }
  });
}
