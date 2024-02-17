class BasicPromisify {
  constructor(action) {
    this.callbacks = []
    this.handleError = undefined

    action(this.resolve.bind(this), this.reject.bind(this))
  }

  resolve(val) {
    let current = val
    try {
      if (this.callbacks.length) {
        for (const callback of this.callbacks) {
          current = callback(current)
        }
      }
    } catch (e) {
      if (this.handleError !== undefined) {
        this.handleError(e)
      } else {
        throw new Error("Uncaught error: %o", e)
      }
    }
  }

  reject(e) {
    if (this.handleError) {
      this.handleError(e)
    }
  }

  then(cb) {
    this.callbacks.push(cb)
    return this
  }

  catch(cb) {
    this.handleError = cb
  }
}

export default BasicPromisify