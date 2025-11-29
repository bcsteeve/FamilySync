/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3344426112")

  // add field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "json2116026601",
    "maxSize": 0,
    "name": "userCategoryIds",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3344426112")

  // remove field
  collection.fields.removeById("json2116026601")

  return app.save(collection)
})
