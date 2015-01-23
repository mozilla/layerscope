
function Murmur3(block, seed) {
    var data = new Uint8Array(block.buffer, block.byteOffset, block.byteLength);
    var len = data.byteLength;
    var nblocks = (len / 4)|0;

    var h1 = seed;
    var c1 = 0xcc9e2d51;
    var c2 = 0x1b873593;

    if (block.byteOffset % 4 == 0) {
	// aligned
    } else {
	// unaligned
    }

    const uint32_t * blocks = (const uint32_t *)(data + nblocks*4);
    
}

  const uint8_t * data = (const uint8_t*)key;
  const int nblocks = len / 4;

  uint32_t h1 = seed;

  const uint32_t c1 = 0xcc9e2d51;
  const uint32_t c2 = 0x1b873593;

  //----------
  // body

  const uint32_t * blocks = (const uint32_t *)(data + nblocks*4);

  for(int i = -nblocks; i; i++)
  {
    uint32_t k1 = getblock(blocks,i);

    k1 *= c1;
    k1 = ROTL32(k1,15);
    k1 *= c2;
   
    h1 ^= k1;
    h1 = ROTL32(h1,13);
    h1 = h1*5+0xe6546b64;
  }

  //----------
  // tail

  const uint8_t * tail = (const uint8_t*)(data + nblocks*4);

  uint32_t k1 = 0;

  switch(len & 3)
  {
  case 3: k1 ^= tail[2] << 16;
  case 2: k1 ^= tail[1] << 8;
  case 1: k1 ^= tail[0];
          k1 *= c1; k1 = ROTL32(k1,15); k1 *= c2; h1 ^= k1;
  };

  //----------
  // finalization

  h1 ^= len;

  h1 = fmix(h1);

  *(uint32_t*)out = h1;
}
