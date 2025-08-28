'use strict';

export const withMeta =
  ({ module, router, action, desired }) =>
  (req, _res, next) => {
    req.resource = { module, router, action, desired };
    next();
  };

export default withMeta;
