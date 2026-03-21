const tasks = {}

module.exports = {
  defineTask: jest.fn((name, fn) => { tasks[name] = fn }),
  isTaskRegisteredAsync: jest.fn(() => Promise.resolve(false)),
  _tasks: tasks,
}
