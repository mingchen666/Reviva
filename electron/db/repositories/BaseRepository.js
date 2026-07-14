export class BaseRepository {
  constructor(context) {
    this.context = context
  }

  get db() {
    return this.context.db
  }
}
