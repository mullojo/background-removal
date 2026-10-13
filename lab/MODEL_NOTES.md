# Models and testing notes

The labels below reflect the linked model repositories as checked on 2026-10-06. Recheck the model and upstream licenses before releasing a supported or funded product. The supplied AI ranking was a useful list of candidates, but its scores and broad performance claims were not independently validated.

| Model | Repository / license | File used in this app | Browser path |
| --- | --- | --- | --- |
| BRIA RMBG 1.4 | [briaai/RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4), [BRIA license](https://huggingface.co/briaai/RMBG-1.4/resolve/9505c97bdbb31adf37f98928baa14bff21c8a188/License.pdf?download=true) | fp16 or q8, approximately 88 or 44 MB | WebGPU FP16 or WASM Q8, selected explicitly |
| ORMBG | [onnx-community/ormbg-ONNX](https://huggingface.co/onnx-community/ormbg-ONNX), Apache 2.0 | fp16 or q8; q8 is [44.3 MB](https://huggingface.co/onnx-community/ormbg-ONNX/tree/main/onnx) | WebGPU FP16 or WASM Q8 |
| MODNet | [Xenova/modnet](https://huggingface.co/Xenova/modnet), Apache 2.0 | fp32, [25.9 MB](https://huggingface.co/Xenova/modnet/tree/main/onnx) | WASM |

BRIA's license is limited to noncommercial evaluation and examination and has restrictions on distributing or hosting the model. A project that accepts gift support while offering BRIA should receive a specific license review or use a release without BRIA. This workbench does not provide a funding control.

ORMBG and MODNet are candidates for a permissively licensed release. ORMBG's upstream model is also [Apache 2.0](https://huggingface.co/schirrmacher/ormbg) and is aimed primarily at people and portraits. MODNet's [upstream repository](https://github.com/ZHKKKe/MODNet) describes it as portrait matting; it is not intended as a general object remover.

## Local browser smoke test

An earlier version included BiRefNet Lite 512, but it gave the user a ghost-like output on their photos and was removed. BEN2 also produced good cutouts earlier, but its Transformers.js 4.3.0 WebGPU path later failed with a `LayerNorm` shader error. A retry with the older 3.8.1 runtime loaded the model but did not finish inference after several minutes on a small image, so BEN2 was removed from this lab. An older runtime failed on ORMBG WebGPU MaxPool; Transformers.js 4.3.0 subsequently ran ORMBG WebGPU successfully on the user's machine. MODNet WASM FP32 produced a usable portrait matte around 1.3 seconds. MODNet WebGPU FP16 and FP32 both produced similar artifacts and ran more slowly on the same portrait, so the lab now offers only MODNet WASM. The [official Transformers.js MODNet WebGPU example](https://github.com/huggingface/transformers.js-examples/tree/main/remove-background-webgpu) uses a different pipeline and may be worth revisiting separately. These are observations on one image and machine, not general performance rankings.
