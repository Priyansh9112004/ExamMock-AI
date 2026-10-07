function userError(message, status = 400) {
  const e = new Error(message);
  e.expose = true;
  e.status = status;
  return e;
}
module.exports = { userError };
