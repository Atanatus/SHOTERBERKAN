// V42 persistence adapter. Not wired into account-production.mjs intentionally.
export function mongoRunStore(collection) {
  if (!collection || typeof collection.insertOne !== 'function' ||
      typeof collection.findOne !== 'function' || typeof collection.updateOne !== 'function') {
    throw new TypeError('Collection is required');
  }
  return Object.freeze({
    async insert(session) { await collection.insertOne(session); },
    async find(id) { return collection.findOne({_id: id}); },
    async claim(id, uid, at, record) {
      const result = await collection.updateOne(
        {_id: id, uid, status: 'ISSUED', expiresAt: {$gt: at}},
        {$set: {status: 'PENDING_INDEPENDENT_VERIFICATION', submittedAt: at, ...record}}
      );
      return result.modifiedCount === 1;
    }
  });
}
