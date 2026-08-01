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
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_ludivra_runtime_abi_version','_ludivra_result_message','_ludivra_runtime_create','_ludivra_runtime_destroy','_ludivra_runtime_submit_input','_ludivra_runtime_step','_ludivra_runtime_declare_statechart_handler','_ludivra_runtime_install_statechart','_ludivra_runtime_statechart_active','_ludivra_runtime_statechart_trace_count','_ludivra_runtime_statechart_traces_write','_ludivra_runtime_statechart_traces_clear','_ludivra_runtime_tick','_ludivra_runtime_state_hash','_ludivra_runtime_load_gameplay','_ludivra_runtime_load_content_pack','_ludivra_runtime_declare_symbol','_ludivra_runtime_integer_state','_ludivra_runtime_save_size','_ludivra_runtime_save_write','_ludivra_runtime_load_save','_ludivra_runtime_replay_size','_ludivra_runtime_replay_write','_ludivra_runtime_verify_replay','_ludivra_runtime_presentation_event_count','_ludivra_runtime_presentation_events_write','_ludivra_runtime_presentation_events_clear','_ludivra_runtime_last_error','_ludivra_runtime_last_error_code','_ludivra_network_abi_version','_ludivra_network_result_message','_ludivra_network_room_create','_ludivra_network_room_destroy','_ludivra_network_room_connect','_ludivra_network_room_submit_input','_ludivra_network_room_reject_client_state','_ludivra_network_room_advance','_ludivra_network_room_snapshot_size','_ludivra_network_room_snapshot_write','_ludivra_spatial_abi_version','_ludivra_spatial_result_message','_ludivra_spatial_world_create','_ludivra_spatial_world_destroy','_ludivra_spatial_world_put','_ludivra_spatial_world_translate','_ludivra_spatial_world_locate','_ludivra_spatial_world_entities_in_count','_ludivra_spatial_world_entities_in_write']"
  "-sFILESYSTEM=0"
  "-sMODULARIZE=1"
  "-sWASM_BIGINT=1"
)
