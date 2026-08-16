import React, { useMemo } from "react"
import { createIcon, pixel, palettes } from "iconoma-icons"

interface WalletAvatarProps {
  address: string
  size?: number
  className?: string
}

export function WalletAvatar({ address, size = 20, className }: WalletAvatarProps) {
  const dataUri = useMemo(() => {
    const icon = createIcon(pixel, {
      seed: address.toLowerCase(),
      size,
      colors: palettes.neon,
      borderRadius: 4,
    })
    return icon.toDataUri()
  }, [address, size])

  return (
    <img
      src={dataUri}
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: 4, display: "block" }}
      alt=""
    />
  )
}
