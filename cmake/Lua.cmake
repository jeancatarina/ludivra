include(FetchContent)

FetchContent_Declare(
  lua_source
  URL https://www.lua.org/ftp/lua-5.4.8.tar.gz
  URL_HASH SHA256=4f18ddae154e793e46eeab727c59ef1c0c0c2b744e7b94219710d76f530629ae
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(lua_source)

add_library(ludivra_lua STATIC
  ${lua_source_SOURCE_DIR}/src/lapi.c
  ${lua_source_SOURCE_DIR}/src/lauxlib.c
  ${lua_source_SOURCE_DIR}/src/lbaselib.c
  ${lua_source_SOURCE_DIR}/src/lcode.c
  ${lua_source_SOURCE_DIR}/src/lcorolib.c
  ${lua_source_SOURCE_DIR}/src/lctype.c
  ${lua_source_SOURCE_DIR}/src/ldblib.c
  ${lua_source_SOURCE_DIR}/src/ldebug.c
  ${lua_source_SOURCE_DIR}/src/ldo.c
  ${lua_source_SOURCE_DIR}/src/ldump.c
  ${lua_source_SOURCE_DIR}/src/lfunc.c
  ${lua_source_SOURCE_DIR}/src/lgc.c
  ${lua_source_SOURCE_DIR}/src/linit.c
  ${lua_source_SOURCE_DIR}/src/liolib.c
  ${lua_source_SOURCE_DIR}/src/llex.c
  ${lua_source_SOURCE_DIR}/src/lmathlib.c
  ${lua_source_SOURCE_DIR}/src/lmem.c
  ${lua_source_SOURCE_DIR}/src/loadlib.c
  ${lua_source_SOURCE_DIR}/src/lobject.c
  ${lua_source_SOURCE_DIR}/src/lopcodes.c
  ${lua_source_SOURCE_DIR}/src/loslib.c
  ${lua_source_SOURCE_DIR}/src/lparser.c
  ${lua_source_SOURCE_DIR}/src/lstate.c
  ${lua_source_SOURCE_DIR}/src/lstring.c
  ${lua_source_SOURCE_DIR}/src/lstrlib.c
  ${lua_source_SOURCE_DIR}/src/ltable.c
  ${lua_source_SOURCE_DIR}/src/ltablib.c
  ${lua_source_SOURCE_DIR}/src/ltm.c
  ${lua_source_SOURCE_DIR}/src/lundump.c
  ${lua_source_SOURCE_DIR}/src/lutf8lib.c
  ${lua_source_SOURCE_DIR}/src/lvm.c
  ${lua_source_SOURCE_DIR}/src/lzio.c
)
target_include_directories(ludivra_lua PUBLIC ${lua_source_SOURCE_DIR}/src)
set_target_properties(ludivra_lua PROPERTIES POSITION_INDEPENDENT_CODE ON)

if(UNIX AND NOT APPLE AND NOT EMSCRIPTEN)
  target_link_libraries(ludivra_lua PRIVATE m dl)
endif()
