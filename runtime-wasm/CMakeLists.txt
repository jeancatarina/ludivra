add_executable(ludivra_runtime_wasm src/anchor.c)
target_link_libraries(ludivra_runtime_wasm PRIVATE ludivra_runtime)

set_target_properties(ludivra_runtime_wasm PROPERTIES
  OUTPUT_NAME "ludivra-runtime"
  SUFFIX ".mjs"
)

target_link_options(ludivra_runtime_wasm PRIVATE
  "--no-entry"
  "-sALLOW_MEMORY_GROWTH=1"
  "-sENVIRONMENT=web,node"
  "-sEXPORT_ES6=1"
  "-sEXPORT_NAME=createLudivraModule"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','UTF8ToString','HEAPU8','HEAPU32']"
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_ludivra_runtime_abi_version','_ludivra_result_message','_ludivra_runtime_create','_ludivra_runtime_destroy','_ludivra_runtime_submit_input','_ludivra_runtime_step','_ludivra_runtime_tick','_ludivra_runtime_state_hash','_ludivra_runtime_load_gameplay','_ludivra_runtime_integer_state','_ludivra_runtime_save_size','_ludivra_runtime_save_write','_ludivra_runtime_load_save','_ludivra_runtime_replay_size','_ludivra_runtime_replay_write','_ludivra_runtime_verify_replay','_ludivra_runtime_last_error']"
  "-sFILESYSTEM=0"
  "-sMODULARIZE=1"
  "-sWASM_BIGINT=1"
)
