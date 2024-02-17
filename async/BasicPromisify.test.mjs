import BasicPromisify from "./BasicPromisify.mjs";

new BasicPromisify((res) => {
  setTimeout(() => {
    res('hello')
  }, 500)
}).then((last) => {
  const next = last.concat(' world')
  console.log('first next: %s', next)
  return next
})
  .then((last) => {
    const next = last.concat(' foo')
    console.log('Second next: %s', next)
    return next
  })

// basic promisify can not handle this direct resolve
// because the callbacks are bound after the main function.
new BasicPromisify((res) => {
  res('hello2')
}).then((last) => {
  const next = last.concat(' world')
  console.log('first next: %s', next)
  return next
})
  .then((last) => {
    const next = last.concat(' foo')
    console.log('Second next: %s', next)
    return next
  })

// this is ok in real promise because Node delays the execution of
// the main function
new Promise((res) => {
  res('real promise hello')
}).then((last) => {
  console.log('real promise first then: %s', last)
  return last.concat(' first then')
}).then((last) => {
  console.log('real promise second then: %s', last)
})