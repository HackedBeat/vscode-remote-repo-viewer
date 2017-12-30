const { expect } = require('chai')
const td = require('testdouble')
const App = require('../../lib/app')

suite('App', () => {
  test('it tries to open a local copy of the repository', async () => {
    const executeCommand = td.function()
    const app = createApp({
      executeCommand,
      localRepositoryPath: 'SAVE_DIR/BAZ'
    })

    await app.fetchRepository()

    td.verify(executeCommand('vscode.openFolder', 'URI(SAVE_DIR/BAZ)', true))
  })

  test('it downloads the git repository into a specified directory', async () => {
    const shellCommandRunner = td.object(['run'])
    const app = createApp({ shellCommandRunner })

    await app.fetchRepository()

    td.verify(
      shellCommandRunner.run('git', [
        'clone',
        '--depth',
        '1',
        'git@FOO.com:BAR/BAZ.git',
        'SAVE_DIR/BAZ'
      ])
    )
  })

  test('it expands environment variables in a path', async () => {
    const shellCommandRunner = td.object(['run'])
    const app = createApp({
      shellCommandRunner,
      repositorySaveDirectoryPath: '{{env.HOME}}/remote-repo-viewer',
      envVars: { HOME: '/PATH/TO/HOME' }
    })

    await app.fetchRepository()

    td.verify(
      shellCommandRunner.run(
        td.matchers.anything(),
        td.matchers.contains('/PATH/TO/HOME/remote-repo-viewer/BAZ')
      )
    )
  })

  test('it opens a new VS Code window to open the repository', async () => {
    const shellCommandRunner = { run: () => Promise.resolve() }
    const executeCommand = td.function()
    const app = createApp({
      shellCommandRunner,
      executeCommand
    })

    await app.fetchRepository()

    td.verify(executeCommand('vscode.openFolder', 'URI(SAVE_DIR/BAZ)', true))
  })

  test('it throws an exception if downloading encounters a problem', () => {
    const shellCommandRunner = {
      run: () => Promise.reject(new Error('UNKNOWN'))
    }
    const app = createApp({ shellCommandRunner })
    return app.fetchRepository().then(throwsIfCalled, e => {
      expect(e.message).to.eql('UNKNOWN')
    })
  })

  test('it logs an error if the command encounters a problem', async () => {
    const shellCommandRunner = {
      run: () => Promise.reject(new Error('UNKNOWN'))
    }
    const errorLogger = td.function()
    const app = createApp({ shellCommandRunner, errorLogger })
    try {
      await app.fetchRepository()
    } catch (_e) {
      td.verify(errorLogger(td.matchers.contains('UNKNOWN')))
    }
  })

  function createApp ({
    shellCommandRunner,
    executeCommand = () => Promise.resolve(),
    localRepositoryPath,
    repositorySaveDirectoryPath = 'SAVE_DIR',
    envVars = {},
    errorLogger = () => {}
  } = {}) {
    const vscWindow = {
      showInputBox: () => Promise.resolve('git@FOO.com:BAR/BAZ.git')
    }
    const vscWorkspace = {
      getConfig: (extensionName, configName) =>
        extensionName === 'remoteRepoViewer' &&
        configName === 'repositoryStoreDirectoryPath' &&
        repositorySaveDirectoryPath
    }
    const vscUri = {
      file: filePath => ({
        get vscodeUri () {
          return `URI(${filePath})`
        }
      })
    }
    const vscCommands = { executeCommand }
    const fileStats = {
      existsDirectory: path => Promise.resolve(path === localRepositoryPath)
    }
    const envVarReader = { read: name => envVars[name] }
    return new App({
      shellCommandRunner,
      vscCommands,
      vscUri,
      vscWindow,
      vscWorkspace,
      fileStats,
      envVarReader,
      logger: { error: errorLogger }
    })
  }

  function throwsIfCalled () {
    throw new Error('Should have been rejected')
  }
})
