
import {findWhere} from 'underline'
import invariant from 'invariant'

import {camelify} from '../util/format'
import os from '../util/os'
import mklog from '../util/log'
const log = mklog('tasks/find-upload')

import client from '../util/api'

import ClassificationActions from '../constants/classification-actions'

export function filterUploads (action, uploads) {
  if (action === 'open') {
    // don't filter if we're just downloading a bunch of files
    return uploads
  }

  // Filter by platform
  const prop = camelify(`p_${os.itchPlatform()}`)
  const platformUploads = uploads.filter((upload) => !!upload[prop] || upload.type === 'html')

  // Filter by format
  const compatibleUploads = platformUploads.filter((upload) =>
    !(/\.(rpm|deb|rar)$/i.test(upload.filename.toLowerCase()))
  )

  return compatibleUploads
}

export function scoreUpload (upload) {
  let filename = upload.filename.toLowerCase()
  let score = 500

  /* Preferred formats */
  if (/\.(zip|7z)$/i.test(filename)) {
    score += 100
  }

  /* Usually not what you want (usually set of sources on Linux) */
  if (/\.tar\.(gz|bz2|xz)$/i.test(filename)) {
    score -= 100
  }

  /* Definitely not something we can launch */
  if (/soundtrack/.test(filename)) {
    score -= 1000
  }

  /* Native uploads are preferred */
  if (upload.type === 'html') {
    score -= 400
  }

  /* Demos are penalized (if we have access to non-demo files) */
  if (upload.demo) {
    score -= 50
  }

  return {...upload, score}
}

export function sortUploads (scoredUploads) {
  return scoredUploads.sort((a, b) =>
    (b.score - a.score)
  )
}

export default async function start (out, opts) {
  const {game, gameId, credentials, market} = opts
  invariant(typeof gameId === 'number', 'find-upload has gameId')
  invariant(typeof market === 'object', 'find-upload has market')

  invariant(credentials && credentials.key, 'find-upload has valid key')
  const keyClient = client.withKey(credentials.key)

  const grabKey = () => market.getEntities('downloadKeys')::findWhere({gameId})
  const {downloadKey = grabKey()} = opts
  let {uploads} = (await keyClient.listUploads(downloadKey, gameId))

  log(opts, `got a list of ${uploads.length} uploads (${downloadKey ? 'with' : 'without'} download key)`)

  if (uploads.length > 0) {
    const freshGame = market.getEntities('games')[gameId] || game
    const action = ClassificationActions[freshGame.classification] || 'launch'

    uploads = filterUploads(action, uploads)
    uploads = uploads.map(scoreUpload)
    uploads = sortUploads(uploads)

    log(opts, `sorted uploads: ${JSON.stringify(uploads, null, 2)}`)
  }
  return {uploads, downloadKey}
}
