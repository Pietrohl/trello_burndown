/* @refresh reload */
import { render } from '@solidjs/web'
import './vendor/chart.umd.min.js'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')

render(() => <App />, root!)
