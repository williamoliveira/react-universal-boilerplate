import path from 'path'
import appRootDir from 'app-root-dir'
import { spawn } from 'child_process'
import { log } from '../utils'

class HotNodeServer {
  constructor(port, name, compiler, clientCompiler) {
    const compiledEntryFile = path.resolve(
      appRootDir.get(),
      compiler.options.output.path,
      `${Object.keys(compiler.options.entry)[0]}.js`,
    )

    const startServer = () => {
      if (this.server) {
        this.server.kill()
        this.server = null
        log({
          title: name,
          level: 'info',
          message: 'Restarting server...',
        })
      }

      const env = Object.assign(process.env, { PORT: port })
      const newServer = spawn('node', [compiledEntryFile, '--color', { env }])

      log({
        title: name,
        level: 'info',
        message: 'Server running with latest changes.',
        notify: true,
      })

      newServer.stdout.on('data', data => console.log(data.toString().trim()))
      newServer.stderr.on('data', (data) => {
        log({
          title: name,
          level: 'error',
          message: 'Error in server execution, check the console for more info.',
        })
        console.error(data.toString().trim())
      })
      this.server = newServer
    }

    const waitForClientThenStartServer = () => {
      if (this.serverCompiling) {
        return
      }
      if (this.clientCompiling) {
        setTimeout(waitForClientThenStartServer, 50)
      } else {
        startServer()
      }
    }

    clientCompiler.plugin('compile', () => {
      this.clientCompiling = true
    })

    clientCompiler.plugin('done', (stats) => {
      if (!stats.hasErrors()) {
        this.clientCompiling = false
      }
    })

    compiler.plugin('compile', () => {
      this.serverCompiling = true
      log({
        title: name,
        level: 'info',
        message: 'Building new bundle...',
      })
    })

    compiler.plugin('done', (stats) => {
      this.serverCompiling = false
      console.log('2. Done compiling')

      if (this.disposing) {
        return
      }

      try {
        if (stats.hasErrors()) {
          log({
            title: name,
            level: 'error',
            message: 'Build failed, check the console for more information.',
            notify: true,
          })
          console.log(stats.toString())
          return
        }

        waitForClientThenStartServer()
      } catch (err) {
        log({
          title: name,
          level: 'error',
          message: 'Failed to start, please check the console for more information.',
          notify: true,
        })
        console.error(err)
      }
    })

    this.watcher = compiler.watch(null, () => undefined)
  }

  dispose() {
    this.disposing = true

    const stopWatcher = new Promise((resolve) => {
      this.watcher.close(resolve)
    })

    return stopWatcher.then(() => {
      if (this.server) this.server.kill()
    })
  }
}

export default HotNodeServer